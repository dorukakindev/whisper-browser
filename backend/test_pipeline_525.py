"""Resume translation must preserve an entire coherent, cacheable sentence."""
import json
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest.mock import patch
import subprocess
import numpy as np
sys.path.insert(0,str(Path(__file__).resolve().parent))
import test_transcribe as F
T=F.T
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools'/'voxcpm2'))
from dub_timing import fit_to_window
from dub_quality import apply_timing_quality
SOURCE=[(0,2,'Please open'),(2,4,'the door.')]

class ResumeTranslation(unittest.TestCase):
    def translate(self,args,answer,precompleted=None):
        seen=[];status={}
        class Client:
            def __init__(self,**kw):self.chat=types.SimpleNamespace(completions=self)
            def create(self,**kw):
                payload=json.loads(kw['messages'][-1]['content']);seen.append((payload,kw['messages'][0]['content']))
                data=answer(payload)
                return types.SimpleNamespace(choices=[types.SimpleNamespace(message=types.SimpleNamespace(content=json.dumps(data,ensure_ascii=False)))])
        with F._fake_openai(Client),patch.object(T,'log'),patch.object(T,'emit'):
            result=T.llm_translate(SOURCE,args,[],source_lang='en',status_out=status,precompleted=precompleted)
        return result,seen,status

    def reply(self,parts):return {'sentences':{'0':' '.join(parts)},'items':dict(zip(['0','1'],parts))}

    def test_changed_locked_part_cannot_silently_lose_the_object(self):
        args=F._TrArgs(translate_for_speech=True,translate_cache=False,translate_workers=1)
        result,seen,status=self.translate(args,lambda _:self.reply(['Lütfen kapıyı','açın.']),{0:'Lütfen'})
        self.assertIsNone(result,'no fresh coherent translation: caller must preserve the existing file')
        self.assertNotIn(1,status.get('completed',[]))
        self.assertEqual(seen[0][0]['items'][0]['locked_translation'],'Lütfen')
        self.assertIn('locked_translation',seen[0][1])

    def test_lock_remains_hard_when_normal_translation_is_lenient(self):
        args=F._TrArgs(translate_for_speech=False,translate_lenient=True,
                      translate_cache=False,translate_workers=1)
        result,_,status=self.translate(args,lambda _:self.reply(['Lütfen kapıyı','açın.']),{0:'Lütfen'})
        self.assertIsNone(result)
        self.assertNotIn(1,status.get('completed',[]))

    def test_resume_sends_lock_and_keeps_it_through_review_and_cache(self):
        def answer(payload):
            locked=payload['items'][0].get('locked_translation')
            return self.reply([locked or 'Lütfen kapıyı','kapıyı açın.' if locked else 'açın.'])
        with tempfile.TemporaryDirectory() as td:
            args=F._TrArgs(translate_for_speech=True,translate_cache=True,cache_dir=td,translate_workers=1)
            result,seen,status=self.translate(args,answer,{0:'Lütfen'})
            self.assertEqual([x[2] for x in result],['Lütfen','kapıyı açın.'])
            self.assertEqual(status['failed'],[])
            self.assertTrue(all(p['items'][0]['locked_translation']=='Lütfen' for p,_ in seen))
            again,cached,_=self.translate(args,answer,{0:'Lütfen'})
            self.assertEqual(again,result);self.assertEqual(cached,[])
            # A different saved manual fragment is part of the request identity.
            other,calls,_=self.translate(args,answer,{0:'Lütfen hemen'})
            self.assertTrue(calls);self.assertEqual(other[0][2],'Lütfen hemen')
            ordinary,calls,_=self.translate(args,answer)
            self.assertTrue(calls,'a locked manual variant must not poison unconstrained sentence cache')
            self.assertEqual([x[2] for x in ordinary],['Lütfen kapıyı','açın.'])

class TempoFallback(unittest.TestCase):
    def test_tempo_worker_is_bounded_and_video_mode_preserves_full_speech(self):
        wav=np.ones(16000,dtype=np.float32)*.1
        with tempfile.TemporaryDirectory() as td:
            def blocked(cmd,**kwargs):
                self.assertGreater(kwargs.get('timeout',0),0,'tempo conversion must have a deadline')
                self.assertIn('-nostdin',cmd)
                Path(td,'fit_example.wav').write_bytes(b'partial')
                raise subprocess.TimeoutExpired(cmd,kwargs['timeout'])
            with patch('dub_timing.subprocess.run',side_effect=blocked):
                out,report=fit_to_window(wav,8000,1.,1.25,td,'example','uzat')
            np.testing.assert_array_equal(out,wav)
            self.assertEqual(report['tempo'],1.)
            self.assertEqual(report['cut_frames'],0)
            self.assertEqual(report['tempo_error'],'timeout')
            self.assertEqual(list(Path(td).iterdir()),[],'partial tempo files are cleaned')
            row={'status':'ready'};apply_timing_quality(row,report)
            self.assertEqual(row['status'],'review');self.assertTrue(row['tempoFallback'])

    def test_failed_tempo_keeps_video_speech_but_strict_mode_stays_strict(self):
        wav=np.ones(16000,dtype=np.float32)*.1
        with tempfile.TemporaryDirectory() as td, patch('dub_timing.subprocess.run',return_value=types.SimpleNamespace(returncode=1)):
            out,report=fit_to_window(wav,8000,1.,1.25,td,'example','uzat')
            self.assertEqual(len(out),len(wav));self.assertEqual(report['tempo_error'],'conversion_failed')
            with self.assertRaises(RuntimeError):
                fit_to_window(wav,8000,1.,1.25,td,'strict','hata')
            self.assertEqual(list(Path(td).iterdir()),[])

if __name__=='__main__':unittest.main()
