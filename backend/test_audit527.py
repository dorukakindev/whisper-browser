"""Bounded media probing and raw generation verification; no personal voice or GPU."""
import ast
import asyncio
import contextlib
import io
import json
import math
from pathlib import Path
import subprocess
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch
import numpy as np
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools/voxcpm2'))
from dub_timing import fit_to_window, tempo_filter
ROOT=Path(__file__).resolve().parents[1]
SCRIPT=ROOT/'tools/voxcpm2/altyazi_oku.py'

def extracted(name, scope):
    node=next(n for n in ast.parse(SCRIPT.read_text(encoding='utf-8')).body if getattr(n,'name',None)==name)
    exec(compile(ast.Module(body=[node],type_ignores=[]),str(SCRIPT),'exec'),scope)
    return scope[name]

class Audit527(unittest.TestCase):
    def test_video_probe_has_a_deadline_and_rejects_nonfinite_failed_or_empty_metadata(self):
        probe=extracted('video_duration',dict(subprocess=subprocess,math=math,NO_WINDOW=0))
        for value,code,expected in [('12.5',0,12.5),('nan',0,None),('inf',0,None),('-1',0,None),('0',0,None),('',0,None),('10',1,None)]:
            with self.subTest(value=value,code=code),patch.object(subprocess,'run',return_value=SimpleNamespace(stdout=value,returncode=code)) as run:
                self.assertEqual(probe('Türkçe video.mp4'),expected)
                self.assertEqual(run.call_args.kwargs['timeout'],30)
                self.assertEqual(run.call_args.args[0][-1],'Türkçe video.mp4')
        for error in [OSError('missing probe'),subprocess.TimeoutExpired('probe',30)]:
            with patch.object(subprocess,'run',side_effect=error):self.assertIsNone(probe('fixture.mp4'))

    def test_tempo_never_uses_a_stage_that_skips_speech_samples(self):
        for ratio in [1.,1.25,2.,2.5,4.,8.,16.]:
            stages=[float(s.split('=')[1]) for s in tempo_filter(ratio).split(',')]
            self.assertTrue(all(1<=v<=2 for v in stages))
            self.assertAlmostEqual(math.prod(stages),ratio,places=5)
        with tempfile.TemporaryDirectory() as folder:
            import soundfile as sf
            def convert(argv,**kw):
                self.assertEqual(argv[argv.index('-af')+1],'atempo=2.000000,atempo=1.250000')
                sf.write(argv[-1],np.ones(8000,dtype=np.float32)*.1,8000)
                return SimpleNamespace(returncode=0)
            with patch.object(subprocess,'run',side_effect=convert):
                audio,report=fit_to_window(np.ones(20000,dtype=np.float32)*.1,8000,1,2.5,folder,'chain','hata')
            self.assertEqual(len(audio),8000);self.assertEqual(report['tempo'],2.5)

    def test_nonfinite_timing_is_rejected_before_allocation_or_ffmpeg(self):
        with tempfile.TemporaryDirectory() as folder,patch.object(subprocess,'run') as run:
            for position in range(3):
                for invalid in (math.nan,math.inf,-math.inf):
                    args=[8000,1.,1.25];args[position]=invalid
                    with self.subTest(position=position,value=invalid),self.assertRaises(ValueError):
                        fit_to_window(np.ones(8000,dtype=np.float32),*args,folder,'invalid','uzat')
            run.assert_not_called()

    def test_malformed_verifier_json_fails_closed_without_destroying_candidate(self):
        async def scenario(payload):
            writes=[]
            async def drain():pass
            async def readline():return (json.dumps(payload)+'\n').encode()
            verifier=extracted('SpeechVerifier',dict(asyncio=asyncio,json=json,speech_check=lambda *a:{'review':False}))('fixture')
            verifier.proc=SimpleNamespace(stdin=SimpleNamespace(write=writes.append,drain=drain),stdout=SimpleNamespace(readline=readline))
            with contextlib.redirect_stdout(io.StringIO()):
                result=await verifier.check('first.wav','Türkçe konuşma.')
                if result['status']=='unavailable':
                    self.assertEqual((await verifier.check('second.wav','Başka.'))['status'],'unavailable')
                    self.assertEqual(len(writes),1)
            return result
        for value in (None,[],['text'],42,True,{'text':None},{'text':[]},{'error':'unavailable'}):
            with self.subTest(payload=value):self.assertEqual(asyncio.run(scenario(value))['status'],'unavailable')
        self.assertEqual(asyncio.run(scenario({'text':'Türkçe konuşma.'}))['status'],'passed')

    def test_verifier_deadline_covers_stalled_stdin_not_only_response_reading(self):
        async def scenario():
            async def drain():await asyncio.Event().wait()
            async def readline():raise AssertionError('read cannot start before blocked drain')
            async def bounded(coro,seconds):return await asyncio.wait_for(coro,.01)
            proxy=SimpleNamespace(Lock=asyncio.Lock,wait_for=bounded,TimeoutError=asyncio.TimeoutError)
            cls=extracted('SpeechVerifier',dict(asyncio=proxy,json=json))
            verifier=cls('fixture');verifier.proc=SimpleNamespace(stdin=SimpleNamespace(write=lambda _:None,drain=drain),stdout=SimpleNamespace(readline=readline))
            with contextlib.redirect_stdout(io.StringIO()):result=await asyncio.wait_for(verifier.check('fixture.wav','Metin.'),.1)
            self.assertEqual(result['status'],'unavailable')
        asyncio.run(scenario())

if __name__=='__main__':unittest.main()
