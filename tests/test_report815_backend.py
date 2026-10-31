"""Deterministic report 815 boundary regressions; no model or network."""
import json
import ast
import io
import os
import sys
import tempfile
import wave
import unittest
from pathlib import Path
from types import SimpleNamespace as NS, ModuleType
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT / 'backend'), str(ROOT / 'tools/voxcpm2')]
import transcribe as T
import browser_align as A
import dub_plan as D
import media as M
import pipeline_control as P
from series_memory import SeriesMemory
from dub_quality import speech_check
from test_transcribe import _fake_openai, _TrArgs, _sentence_translate


class Report815BackendTests(unittest.TestCase):
    def test_dual_paths_include_target_and_qualifiers(self):
        tr = T.translation_output_labels(NS(translate_to='tr'), 'movie')
        de = T.translation_output_labels(NS(translate_to='de'), 'movie')
        self.assertNotEqual(tr[1], de[1])
        self.assertEqual(T.translation_output_labels(NS(translate_to='tr'), 'movie', ['speech'])[1], 'movie.tr.speech')

    def test_ass_drawing_is_not_dialogue_and_p0_restores_text(self):
        text = '[Events]\nDialogue: 0,0:00:01.00,0:00:02.00,Default,,0,0,0,,{\\p1}m 0 0 l 100 0 100 100{\\p0}\nDialogue: 0,0:00:02.00,0:00:04.00,Default,,0,0,0,,{\\p1}m 0 0{\\p0}Hello there.'
        entries, formats, dropped = T.drop_empty_entries(T.parse_ass(text), T.parse_ass_cue_formats(text))
        self.assertEqual(entries, [(2., 4., 'Hello there.')])
        self.assertEqual(len(formats), 1)
        self.assertEqual(dropped, 1)

    def test_vtt_spoken_metadata_keywords_literal_tags_and_timestamp(self):
        for keyword in ['NOTE', 'STYLE', 'REGION']:
            text = f'WEBVTT\n\nNOTE metadata\nnot dialogue\n\n00:00:01.000 --> 00:00:04.000\n{keyword} this is spoken.\n'
            self.assertEqual(T.parse_srt(text, vtt=True), [(1., 4., f'{keyword} this is spoken.')])
        entries = T.parse_srt('WEBVTT\n\n00:00:01.000 --> 00:00:04.000\nType &lt;b&gt;hello&lt;/b&gt; <00:00:02.000>now.', vtt=True)
        output = T.vtt_escape_cue_text(entries[0][2])
        self.assertIn('&lt;b>hello&lt;/b>', output)
        self.assertNotIn('<b>', output)
        self.assertNotIn('00:00:02', output)
        self.assertEqual(T.vtt_escape_cue_text('<b>real style</b>'), '<b>real style</b>')

    def test_dub_literal_body_time_range_keeps_source_identity(self):
        payload = b'1\n00:00:00,000 --> 00:00:04,000\nUse this interval:\n00:00:02,000 --> 00:00:03,000\nfor the title.\n\n2\n00:00:04,000 --> 00:00:06,000\nNext cue.\n'
        cues = D.parse_srt('unused.srt', source_bytes=payload)
        self.assertEqual(len(cues), 2)
        self.assertEqual(cues.source_ids, [1, 2])
        self.assertIn('00:00:02,000 --> 00:00:03,000', cues[0][2])

    def test_asr_names_quantity_ownership_and_billion_equivalence(self):
        base = 'Bu kapsamlı raporda belirtilen bütün teknik ayrıntıları dikkatlice inceleyerek bugün toplantıda ekip arkadaşlarımla birlikte değerlendirdim. '
        self.assertTrue(speech_check(base+'Mehmet toplantıya katıldı.', base+'Ahmet toplantıya katıldı.')['review'])
        self.assertTrue(speech_check(base+'Ali beş, Ayşe on kitap aldı.', base+'Ali on, Ayşe beş kitap aldı.')['review'])
        self.assertFalse(speech_check(base+'Mehmet toplantıya katıldı.', base+'Mehmet toplantıya katıldı.')['review'])
        expected = 'Dünya nüfusu sekiz milyar insanı geçti.'
        self.assertFalse(speech_check(expected, 'Dünya nüfusu 8 milyar insanı geçti.', numeric_reference='Dünya nüfusu 8 milyar insanı geçti.')['review'])
        self.assertTrue(speech_check(expected, 'Dünya nüfusu 9 milyar insanı geçti.')['review'])

    def test_reference_overlays_do_not_double_count_seconds(self):
        reference = [(start, start+3) for start in (0, 20, 40, 60) for _ in range(2)]
        self.assertAlmostEqual(A.overlap_score(reference, [(s, s+10) for s in (0,20,40,60)]), .3)

    def cleanup(self, entries, result=None, finish='stop', error=None, **options):
        calls, warnings = [], []
        class Client:
            def __init__(self, **_): self.chat = NS(completions=self)
            def create(self, **kwargs):
                calls.append(kwargs)
                if error: raise error
                return NS(choices=[NS(message=NS(content=json.dumps(result)), finish_reason=finish)])
        args = NS(llm_api_key='fixture', llm_model='fixture', llm_base_url='https://example.invalid',
                  llm_fix_censorship=False, llm_fix_hallucination=False,
                  llm_fix_punctuation=True, llm_fix_consistency=False, llm_workers=1, **options)
        with _fake_openai(Client), patch.object(T, 'emit'), patch.object(T, 'log'):
            output = T.llm_postprocess(entries, args, warnings)
        return output, calls, warnings

    def test_cleanup_rejects_negation_rewrite_and_short_expansion(self):
        source = [(0, 3, 'Please do not open the red door.')]
        out, _, warnings = self.cleanup(source, {'0':'Please open the red door now.'})
        self.assertEqual(out, source)
        self.assertTrue(warnings)
        source = [(0, 1, 'Hello.')]
        out, _, _ = self.cleanup(source, {'0':'Invented content '*100})
        self.assertEqual(out, source)
        out, _, warnings = self.cleanup([(0, 1, 'hello')], {'0':'Hello.'})
        self.assertEqual(out[0][2], 'Hello.')
        self.assertFalse(warnings)

    def test_cleanup_length_response_cannot_publish_partial_text(self):
        source = [(0, 3, 'Keep the complete original text.')]
        out, _, warnings = self.cleanup(source, {'0':'Keep the complete original text!'}, finish='length')
        self.assertEqual(out, source)
        self.assertTrue(warnings)

    def test_cleanup_fatal_auth_stops_queued_chunks(self):
        error = RuntimeError('401 invalid API key')
        error.status_code = 401
        source = [(i, i+1, 'hello') for i in range(91)]
        out, calls, warnings = self.cleanup(source, error=error)
        self.assertEqual(out, source)
        self.assertEqual(len(calls), 1)
        self.assertTrue(warnings)

    def test_scene_notes_invalidate_fuzzy_memory(self):
        with tempfile.TemporaryDirectory() as folder:
            entries = [(0., 3., 'The bank is very close.')]
            args = _TrArgs(cache_dir=folder, input='ambiguous.srt', scene_context={'location':'financial district'})
            first, seen, _, _ = _sentence_translate(entries, args, lambda _: {'items':{'0':'Banka çok yakın.'},'sentences':{'0':'Banka çok yakın.'}})
            args.scene_context = {'location':'river bank'}
            second, seen2, _, _ = _sentence_translate(entries, args, lambda _: {'items':{'0':'Nehir kıyısı çok yakın.'},'sentences':{'0':'Nehir kıyısı çok yakın.'}})
            self.assertEqual(len(seen), 1)
            self.assertEqual(len(seen2), 1)
            self.assertNotEqual(first, second)

    def test_new_series_canon_invalidates_exact_and_fuzzy_cache(self):
        with tempfile.TemporaryDirectory() as folder:
            entries = [(0., 3., 'The captain is nearby.')]
            args = _TrArgs(cache_dir=folder, input='Synthetic_Show.S01E02.srt')
            reply = lambda text: lambda _: {'items':{'0':text},'sentences':{'0':text}}
            first, calls, _, _ = _sentence_translate(entries, args, reply('Kaptan yakınlarda.'))
            memory, _ = SeriesMemory.for_input(folder, 'Synthetic_Show.S01E01.srt', 'en', 'tr')
            self.assertTrue(memory.merge({'terms':{'captain':'Reis'}}, 1, 1))
            second, changed_calls, _, _ = _sentence_translate(entries, args, reply('Reis yakınlarda.'))
            self.assertEqual(len(calls), 1)
            self.assertEqual(len(changed_calls), 1)
            self.assertNotEqual(first, second)

    def test_mixed_auto_source_reaches_translation_and_dual_files_are_distinct(self):
        with tempfile.TemporaryDirectory() as folder:
            source = Path(folder) / 'source.en.srt'
            entries = [(i*2, i*2+1, 'Bu iş için şimdi hazırız.' if i<40 else 'We need to finish this important report.') for i in range(100)]
            T.write_srt(entries, source, wrap_mode='none')
            calls, events = [], []
            def translate(rows, args, warn, source_lang=None, status_out=None, **_):
                calls.append(rows)
                status_out.update(completed=list(range(len(rows))), failed=[])
                return [(s,e,'Rapor hazır.' if args.translate_to == 'tr' else 'Der Bericht ist fertig.') for s,e,_ in rows]
            args = NS(input=str(source), output_dir=folder, language='auto', translate_to='tr',
                translate_model='fixture', translate_base_url='https://example.invalid', max_line_width=42,
                max_lines=2, wrap_mode='none', formats='srt', dual_subtitle=True,
                dual_translation_first=True, translate_existing='', max_cps=21, translate_for_speech=True)
            with patch.object(T,'llm_translate',side_effect=translate), patch.object(T,'emit',side_effect=lambda kind,**v:events.append({'type':kind,**v})), patch.object(T,'log'):
                T.translate_existing_subtitle(args)
                self.assertTrue(calls)
                tr_dual = next(Path(p) for p in events[-1]['files'] if '.dual.' in p)
                original = tr_dual.read_bytes()
                args.translate_to='de'
                T.translate_existing_subtitle(args)
                de_dual = next(Path(p) for p in events[-1]['files'] if '.dual.' in p)
                self.assertNotEqual(tr_dual, de_dual)
                self.assertEqual(tr_dual.read_bytes(), original)

    def test_adaptive_retry_preserves_old_file_and_atomically_publishes_success(self):
        with tempfile.TemporaryDirectory() as folder:
            final = Path(folder) / 'fixture [abc].mp4'
            final.write_bytes(b'previous-good-video')
            def response(*_, **__):
                result=io.BytesIO(b'synthetic-stream')
                result.headers={'Content-Length':'16'}
                return result
            def failed(cmd, **_):
                Path(cmd[-1]).write_bytes(b'partial')
                return NS(returncode=1,stderr='controlled failure')
            def succeeded(cmd, **_):
                self.assertEqual(final.read_bytes(),b'previous-good-video')
                Path(cmd[-1]).write_bytes(b'complete-new-video')
                return NS(returncode=0,stderr='')
            with patch.object(M,'_find_ffmpeg',return_value='fixture'), patch('urllib.request.urlopen',side_effect=response), patch.object(M,'emit'), patch.object(M,'log'):
                with patch('subprocess.run',side_effect=failed), self.assertRaises(RuntimeError):
                    M.download_stream('https://example.invalid/v','https://example.invalid/a','fixture',720,'en',folder,'abc')
                self.assertEqual(final.read_bytes(),b'previous-good-video')
                with patch('subprocess.run',side_effect=succeeded):
                    M.download_stream('https://example.invalid/v','https://example.invalid/a','fixture',720,'en',folder,'abc')
                self.assertEqual(final.read_bytes(),b'complete-new-video')
                self.assertEqual(list(Path(folder).glob('*.invtmp-*')),[])

    def test_youtube_audio_language_selects_separate_cache_bytes(self):
        with tempfile.TemporaryDirectory() as folder:
            paths=[]
            class YoutubeDL:
                def __init__(self, options): self.options=options
                def __enter__(self): return self
                def __exit__(self,*_): pass
                def extract_info(self, url, download=True):
                    path=Path(self.options['outtmpl'].replace('%(id)s','abc').replace('%(ext)s','webm'))
                    if not path.exists(): path.write_bytes(self.options['format'].encode())
                    paths.append(path)
                    return {'id':'abc','title':'fixture','requested_downloads':[{'filepath':str(path)}]}
            with patch.dict(sys.modules,{'yt_dlp':NS(YoutubeDL=YoutubeDL)}), patch.object(T,'log'), patch.object(T,'emit'):
                en=T.download_youtube('https://example.invalid',folder,audio_lang='en')[0]
                tr=T.download_youtube('https://example.invalid',folder,audio_lang='tr')[0]
            self.assertNotEqual(en,tr)
            self.assertNotEqual(Path(en).read_bytes(),Path(tr).read_bytes())

    def test_sync_uses_owned_scratch_and_honors_cancel_after_extract(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder); source=root/'audio.wav'; source.write_bytes(b'fixture')
            subtitles=root/'source.srt'; subtitles.write_text('1\n00:00:00,000 --> 00:00:02,000\nHello.\n')
            marker=root/'cancel.flag'; scratch=[]; events=[]
            def extracted(_, target, __):
                scratch.append(Path(target))
                self.assertTrue(Path(target).is_relative_to(root/'owned'))
                marker.write_text('cancel')
            with patch.dict(os.environ,{'WHISPER_JOB_TEMP_DIR':str(root/'owned')}), patch.object(P,'_CANCELLATION',P.CancellationController(str(marker))), patch.object(T,'find_ffmpeg',return_value='fixture'), patch.object(T,'extract_audio',side_effect=extracted), patch.object(T,'emit',side_effect=lambda kind,**v:events.append(kind)), patch.object(T,'log'):
                with self.assertRaises(P.PipelineCancelled):
                    T.sync_subtitles(NS(input=str(source),sync_srt=str(subtitles),output_dir=folder))
            self.assertTrue(scratch)
            self.assertNotIn('done',events)
            self.assertFalse((root/'source.synced.srt').exists())

    def test_resume_diarization_uses_full_audio_for_old_and_new_speakers(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder)
            parsed=ast.parse((ROOT/'backend/transcribe.py').read_text(encoding='utf-8'))
            main=next(n for n in parsed.body if isinstance(n,ast.FunctionDef) and n.name=='main')
            prefix=[]
            for statement in main.body:
                if isinstance(statement,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='args' for t in statement.targets): break
                prefix.append(statement)
            env=dict(T.__dict__)
            exec(compile(ast.Module(body=prefix,type_ignores=[]),'parser','exec'),env)
            args=env['parser'].parse_args(['--input',str(root/'source.wav'),'--output-dir',str(root/'out'),
                '--cache-dir',str(root/'cache'),'--device','cpu','--compute-type','int8','--diarize','true',
                '--formats','json','--fix-timings','false','--snap-to-speech','false','--split-mode','none',
                '--fix-common-errors','false','--drop-repeated-hallucinations','false'])
            args.scene_context=None
            def audio(path, seconds):
                with wave.open(str(path),'wb') as handle:
                    handle.setnchannels(1);handle.setsampwidth(2);handle.setframerate(16000)
                    handle.writeframes(b'\0\0'*16000*seconds)
            audio(args.input,12)
            Path(T._checkpoint_path(args.input,args.cache_dir)).parent.mkdir(parents=True,exist_ok=True)
            T.write_checkpoint(T._checkpoint_path(args.input,args.cache_dir),T.job_signature(args),
                [(0,2,'Old first sentence.'),(3,5,'Old second sentence.'),(8,10,'Old boundary sentence.')],10,detected_language='en')
            extraction=[];events=[];diarized=[]
            def extract(_,destination,__,**options):
                extraction.append(options)
                audio(destination,4 if options.get('clip_start') else 12)
            class Model:
                def __init__(self,*_,**__): pass
                def transcribe(self,*_,**__):
                    return iter([NS(start=0.,end=2.,text='New boundary sentence.',words=[]),NS(start=2.,end=4.,text='New final sentence.',words=[])]),NS(language='en',language_probability=1.,duration=4.)
            def diarize(path,**_):
                with wave.open(str(path),'rb') as handle: duration=handle.getnframes()/handle.getframerate()
                diarized.append(duration)
                return [(0.,duration,'SPEAKER_00')]
            fake=ModuleType('faster_whisper');fake.WhisperModel=Model
            with patch.dict(sys.modules,{'faster_whisper':fake}), patch.object(T,'find_ffmpeg',return_value='fixture'), patch.object(T,'extract_audio',side_effect=extract), patch.object(T,'check_vram_budget'), patch.object(T,'run_diarization',side_effect=diarize), patch.object(T,'emit',side_effect=lambda kind,**v:events.append({'type':kind,**v})), patch.object(T,'log'):
                T.transcribe(args)
            self.assertEqual(extraction[0].get('clip_start'),8.)
            self.assertEqual(diarized,[12.])
            done=next(event for event in events if event['type']=='done')
            segments=json.loads(Path(done['files'][0]).read_text(encoding='utf-8'))['segments']
            self.assertTrue(any(segment['start']==0 for segment in segments))
            self.assertTrue(all(segment['speaker']=='SPEAKER_00' for segment in segments))


if __name__ == '__main__':
    unittest.main()
