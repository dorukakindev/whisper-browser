"""Finalization and optional verifier cleanup must preserve completed speech."""
import ast
import asyncio
import contextlib
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

import numpy as np
import soundfile as sf
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tools/voxcpm2'))
from dub_finalize import normalize_audio


class Audio528(unittest.TestCase):
    def wav(self,folder):
        path=Path(folder)/'Türkçe ses.wav'
        rate=24000
        sf.write(path,.08*np.sin(2*np.pi*220*np.arange(rate*3)/rate),rate)
        return path

    def test_failed_or_hung_normalization_preserves_original_and_cleans_partial(self):
        for mode in ('timeout_probe','timeout_render','bad_probe','nonfinite','truncated','wrong_rate','locked'):
            with self.subTest(mode=mode),tempfile.TemporaryDirectory() as temp:
                path=self.wav(temp);original=path.read_bytes();calls=[]
                def run(args,**kw):
                    calls.append(args);self.assertTrue(30<=kw['timeout']<=600)
                    if len(calls)==1:
                        if mode=='timeout_probe':raise subprocess.TimeoutExpired('ffmpeg',30)
                        stats=dict(input_i='-25',input_tp='-10',input_lra='3',input_thresh='-35',target_offset='0')
                        if mode=='nonfinite':stats['input_i']='-inf'
                        return SimpleNamespace(returncode=1 if mode=='bad_probe' else 0,stderr=json.dumps(stats))
                    if mode=='timeout_render':
                        Path(args[-1]).write_bytes(b'partial');raise subprocess.TimeoutExpired('ffmpeg',30)
                    samples=np.zeros(24000 if mode=='truncated' else 72000,dtype=np.float32)
                    sf.write(args[-1],samples,48000 if mode=='wrong_rate' else 24000)
                    return SimpleNamespace(returncode=0)
                replace=patch('dub_finalize.os.replace',side_effect=PermissionError('locked')) if mode=='locked' else contextlib.nullcontext()
                with replace:self.assertFalse(normalize_audio(path,run=run))
                self.assertEqual(path.read_bytes(),original)
                self.assertFalse(path.with_suffix('.norm.tmp.wav').exists())

    def test_real_ffmpeg_keeps_requested_path_rate_frames_and_playable_output(self):
        if not shutil.which('ffmpeg'):self.skipTest('ffmpeg is not available on PATH')
        with tempfile.TemporaryDirectory() as temp:
            path=self.wav(temp);before=sf.info(path)
            self.assertTrue(normalize_audio(path))
            after=sf.info(path)
            self.assertEqual(after.samplerate,before.samplerate)
            self.assertEqual(after.frames,before.frames)
            self.assertGreater(np.max(np.abs(sf.read(path)[0])),0)
            self.assertFalse(path.with_suffix('.norm.tmp.wav').exists())

    def test_one_prosody_timeout_keeps_good_excerpts_and_repeated_failures_are_bounded(self):
        import prepare_prosody as P
        good=SimpleNamespace(returncode=0,stdout=(np.ones(8000,dtype='<f4')*.1).tobytes())
        timeout=subprocess.TimeoutExpired('ffmpeg',90)
        for sequence,expected,call_count in [([good,timeout,good],[True,False,True],3),
                                             ([good,timeout,timeout,timeout],[True,False,False,False,False],4)]:
            with tempfile.TemporaryDirectory() as temp:
                folder=Path(temp);source=folder/'video.mp4';source.write_bytes(b'controlled source')
                srt=folder/'input.srt';output=folder/'delivery.json'
                srt.write_text(''.join(f'{i+1}\n00:00:{2*i:02},000 --> 00:00:{2*i+1:02},000\nA full sentence.\n\n' for i in range(len(expected))),encoding='utf-8')
                argv=['prepare','--source',str(source),'--srt',str(srt),'--output',str(output),'--ffmpeg','ffmpeg','--grouping','satir']
                with patch.object(sys,'argv',argv),patch.object(P.subprocess,'run',side_effect=sequence) as run,patch.object(P,'features',return_value={'valid':True}),patch.object(P,'delivery_rows',side_effect=lambda rows,_:rows),contextlib.redirect_stdout(io.StringIO()):
                    P.main()
                rows=json.loads(output.read_text())['groups']
                self.assertEqual([r['features'] is not None for r in rows],expected)
                self.assertEqual(run.call_count,call_count)
                self.assertFalse(output.with_suffix('.partial.json').exists())

    def test_quiet_excerpts_do_not_disable_later_prosody_analysis(self):
        import prepare_prosody as P
        with tempfile.TemporaryDirectory() as temp:
            folder=Path(temp);source=folder/'video.mp4';source.write_bytes(b'fixture')
            srt=folder/'input.srt';output=folder/'delivery.json'
            srt.write_text(''.join(f'{i+1}\n00:00:{2*i:02},000 --> 00:00:{2*i+1:02},000\nSpeech.\n\n' for i in range(4)))
            good=SimpleNamespace(returncode=0,stdout=np.zeros(8000,dtype='<f4').tobytes())
            argv=['prepare','--source',str(source),'--srt',str(srt),'--output',str(output),'--ffmpeg','ffmpeg','--grouping','satir']
            with patch.object(sys,'argv',argv),patch.object(P.subprocess,'run',return_value=good) as run,patch.object(P,'features',side_effect=[None,None,None,{'valid':True}]),patch.object(P,'delivery_rows',side_effect=lambda rows,_:rows),contextlib.redirect_stdout(io.StringIO()):
                P.main()
            self.assertEqual(run.call_count,4)
            self.assertIsNotNone(json.loads(output.read_text())['groups'][-1]['features'])

    def test_verifier_cleanup_cannot_mask_the_original_generation_result(self):
        node=next(n for n in ast.parse((ROOT/'tools/voxcpm2/altyazi_oku.py').read_text(encoding='utf-8')).body if getattr(n,'name',None)=='SpeechVerifier')
        async def scenario(mode):
            calls=[]
            async def bounded(coro,timeout):return await asyncio.wait_for(coro,.005)
            proxy=SimpleNamespace(Lock=asyncio.Lock,wait_for=bounded,TimeoutError=asyncio.TimeoutError)
            scope={'asyncio':proxy};exec(compile(ast.Module(body=[node],type_ignores=[]),'verifier','exec'),scope)
            verifier=scope['SpeechVerifier']('fixture')
            async def wait():await asyncio.Event().wait()
            def terminate():
                calls.append('terminate')
                if mode=='denied':raise PermissionError('not allowed')
            def kill():calls.append('kill')
            verifier.proc=SimpleNamespace(returncode=None,terminate=terminate,kill=kill,wait=wait)
            with contextlib.redirect_stdout(io.StringIO()) as log:await verifier.close()
            self.assertEqual(calls,['terminate','kill'])
            self.assertIn('verification_shutdown_failed',log.getvalue())
        for mode in ('unresponsive','denied'):asyncio.run(scenario(mode))

if __name__=='__main__':unittest.main()
