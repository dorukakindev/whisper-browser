"""Deterministic Whisper -> speech translation -> SRT -> TTS-plan seams."""
import json
import os
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest.mock import patch

import transcribe as T
import test_transcribe as F
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools' / 'voxcpm2'))
from dub_plan import parse_srt as read_tts_srt, make_groups
from dub_quality import speech_check


class PipelineSeams(unittest.TestCase):
    def run_whisper(self, root, speech=False):
        source = root / 'video.mp4'
        source.write_bytes(b'synthetic fixture')
        argv = ['transcribe.py', '--input', str(source), '--output-dir', str(root),
                '--engine', 'faster', '--device', 'cpu', '--language', 'en', '--split-mode', 'none',
                '--clip-start', '5:00', '--clip-end', '5:10', '--formats', 'srt,json',
                '--translate', 'true', '--translate-for-speech', str(speech).lower(), '--dual-subtitle', 'true']
        for option in ['resume', 'merge-short', 'merge-incomplete', 'merge-continuation', 'fix-common-errors',
                       'drop-repeated-hallucinations', 'snap-to-speech', 'fix-timings', 'dedupe',
                       'drop-trailing-hallucination', 'fix-punctuation-collapse', 'quality-report', 'confidence-report']:
            argv.extend(['--'+option, 'false'])
        with patch.object(sys, 'argv', argv), patch.object(T, 'transcribe') as captured:
            T.main()
        args = captured.call_args.args[0]
        lines = [(0.5,1.5,'Please open the door.'),(2.,3.5,'Do not touch the red switch.')]
        class Model:
            def __init__(self, *a, **kw): pass
            def transcribe(self, *a, **kw):
                return iter([types.SimpleNamespace(start=s,end=e,text=text,words=[
                    types.SimpleNamespace(start=s,end=e,word=text,probability=.99)]) for s,e,text in lines]), \
                    types.SimpleNamespace(language='en',language_probability=1.,duration=4.)
        fake = types.ModuleType('faster_whisper'); fake.WhisperModel = Model
        def translated(entries, args, warnings, **kwargs):
            kwargs['status_out'].update(completed=[0,1],failed=[])
            texts=['Lütfen kapıyı açın.','Kırmızı anahtara dokunmayın.'] if args.translate_for_speech else ['Kapıyı açın.','Kırmızı anahtara dokunmayın.']
            return [(s,e,texts[i]) for i,(s,e,_) in enumerate(entries)]
        with patch.dict(sys.modules, {'faster_whisper':fake}), patch.object(T,'find_ffmpeg',return_value='ffmpeg'), \
             patch.object(T,'resolve_device_and_compute',return_value=('cpu','int8')), \
             patch.object(T,'build_prompt_and_hotwords',return_value=('','','')), patch.object(T,'extract_audio'), \
             patch.object(T,'llm_translate',side_effect=translated), patch.object(T,'log'), \
             patch.object(T,'emit') as events, patch.object(T,'_wx_free_gpu'):
            T.transcribe(args)
        return [c.kwargs for c in events.call_args_list if c.args[0]=='done'][-1]

    def test_whisper_speech_translation_does_not_overwrite_normal_translation(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            first=self.run_whisper(root)
            normal=next(Path(o['path']) for o in first['outputs'] if o['role']=='translation')
            original=normal.read_bytes()
            second=self.run_whisper(root,True)
            voice=next(Path(o['path']) for o in second['outputs'] if o['role']=='translation')
            self.assertNotEqual(voice,normal)
            self.assertEqual(normal.read_bytes(),original)
            self.assertIn('.speech.',voice.name)
            plan=make_groups(read_tts_srt(voice),300,310,mode='akici')
            self.assertEqual(' '.join(g['text'] for g in plan),'Lütfen kapıyı açın. Kırmızı anahtara dokunmayın.')
            self.assertEqual([i for g in plan for i in g['source_ids']],[1,2])
            self.assertAlmostEqual(plan[0]['start'],300500)
            source_json=next(Path(o['path']) for o in second['outputs'] if o['role']=='source' and o['path'].endswith('.json'))
            data=json.loads(source_json.read_text(encoding='utf-8'))
            self.assertAlmostEqual(data['segments'][0]['words'][0]['start'],300.5)

    def test_whisper_speech_dual_subtitles_do_not_overwrite_normal_dual(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);ordinary=self.run_whisper(root)
            normal=next(Path(o['path']) for o in ordinary['outputs'] if o['role']=='dual');original=normal.read_bytes()
            speech=self.run_whisper(root,True)
            dual=next(Path(o['path']) for o in speech['outputs'] if o['role']=='dual')
            self.assertNotEqual(dual,normal);self.assertEqual(normal.read_bytes(),original)

    def test_verifier_marks_reversed_turkish_instruction_despite_high_similarity(self):
        prefix = 'Bu aygıtı kullanırken önce bütün bağlantıları dikkatli biçimde denetleyin ve sonrasında panel üzerindeki '
        suffix = ' çünkü diğer bütün ayarlar henüz gözden geçirilerek tamamlanmadı.'
        for before, after in [('kırmızı anahtara dokunmayın', 'kırmızı anahtara dokunun'),
                              ('bu şartlarda devam etmemelisiniz', 'bu şartlarda devam etmelisiniz')]:
            with self.subTest(before=before):
                result=speech_check(prefix+before+suffix,prefix+after+suffix)
                self.assertGreater(result['similarity'],.9)
                self.assertTrue(result['semantic_mismatch']);self.assertTrue(result['review'])
                inverse=speech_check(prefix+after+suffix,prefix+before+suffix)
                self.assertTrue(inverse['review'])
                self.assertFalse(speech_check(prefix+before+suffix,prefix+before+suffix)['review'])

    def test_completed_speech_removes_only_its_partial_artifacts(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);source=root/'video.en.srt'
            T.write_srt([(0,2,'Please open the door.'),(2,4,'Do not touch the red switch.')],source)
            args=F._TrArgs(input=str(source),output_dir=tmp,language='en',translate_for_speech=True,
                          translate_cache=False,translate_existing='',formats='srt',max_lines=2,
                          wrap_mode='sentence',dual_subtitle=True,dual_translation_first=False)
            def partial(entries,args,warnings,**kw):
                kw['status_out'].update(completed=[0],failed=[1],failedReasons={'1':'api_failure'})
                return [(0,2,'Lütfen kapıyı açın.'),entries[1]]
            def complete(entries,args,warnings,**kw):
                kw['status_out'].update(completed=[0,1],failed=[])
                return [(0,2,'Lütfen kapıyı açın.'),(2,4,'Kırmızı anahtara dokunmayın.')]
            with patch.object(T,'emit'),patch.object(T,'log'),patch.object(T,'llm_translate',side_effect=partial):
                T.translate_existing_subtitle(args)
            partial_voice=root/'video.tr.speech.partial.srt';self.assertTrue(partial_voice.exists())
            other=root/'video.tr.partial.srt';other.write_text('normal unfinished translation',encoding='utf-8')
            ordinary_dual=root/'video.dual.partial.srt';ordinary_dual.write_text('normal dual draft',encoding='utf-8')
            voice_dual=root/'video.tr.speech.dual.partial.srt';self.assertTrue(voice_dual.exists())
            args.translate_existing=str(partial_voice)
            with patch.object(T,'emit'),patch.object(T,'log'),patch.object(T,'llm_translate',side_effect=complete):
                T.translate_existing_subtitle(args)
            self.assertFalse(partial_voice.exists());self.assertFalse(Path(str(partial_voice)+'.meta.json').exists())
            self.assertEqual(other.read_text(encoding='utf-8'),'normal unfinished translation')
            self.assertEqual(ordinary_dual.read_text(encoding='utf-8'),'normal dual draft')
            self.assertFalse(voice_dual.exists())


if __name__=='__main__': unittest.main()
