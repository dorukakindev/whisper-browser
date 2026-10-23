"""Dubbing must preserve expression, prompt fidelity and declared ASR language."""
import ast
import asyncio
import json
from pathlib import Path
import shutil
import sys
import tempfile
from types import SimpleNamespace
import unittest

import numpy as np
import soundfile as sf

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools/voxcpm2'))
from dub_finalize import normalize_audio


class Audio531(unittest.TestCase):
    def test_declared_language_survives_runtime_ndjson_bridge(self):
        script=Path(__file__).resolve().parents[1]/'tools/voxcpm2/altyazi_oku.py'
        node=next(n for n in ast.parse(script.read_text(encoding='utf-8')).body if getattr(n,'name',None)=='SpeechVerifier')
        scope={'asyncio':asyncio,'json':json,'speech_check':lambda *args:{'review':False}}
        exec(compile(ast.Module(body=[node],type_ignores=[]),str(script),'exec'),scope)
        async def run(language):
            writes=[]
            async def drain():pass
            async def readline():return b'{"text":"Merhaba."}\n'
            verifier=scope['SpeechVerifier']('fixture',language)
            verifier.proc=SimpleNamespace(stdin=SimpleNamespace(write=writes.append,drain=drain),
                                           stdout=SimpleNamespace(readline=readline))
            self.assertEqual((await verifier.check('Kısa.wav','Merhaba.'))['status'],'passed')
            return json.loads(writes[0])
        self.assertEqual(asyncio.run(run('tr')),{'path':'Kısa.wav','language':'tr'})
        self.assertEqual(asyncio.run(run('auto')),{'path':'Kısa.wav'})

    def test_constant_gain_preserves_quiet_and_emphatic_sections(self):
        if not shutil.which('ffmpeg'):
            self.skipTest('ffmpeg unavailable')
        rate=24000
        tone=np.sin(2*np.pi*220*np.arange(rate*5)/rate)
        levels=[.03,.03,.12,.12,.03,.03]
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/'Duygulu anlatım.wav'
            sf.write(path,np.concatenate([tone*k for k in levels]),rate,subtype='PCM_16')
            before,_=sf.read(path)
            self.assertTrue(normalize_audio(path))
            after,sr=sf.read(path)
            self.assertEqual((len(after),sr),(len(before),rate))
            changes=[]
            for i in range(len(levels)):
                selection=slice((i*5+1)*rate,(i*5+4)*rate)
                rms=lambda wav:np.sqrt(np.mean(wav[selection]**2))
                changes.append(20*np.log10(rms(after)/rms(before)))
            self.assertLess(max(changes)-min(changes),.02)
            self.assertLess(float(np.max(np.abs(after))),.80)

    def test_peak_headroom_wins_over_unreachable_loudness_without_compression(self):
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/'speech.wav'
            sf.write(path,np.ones(8000)*.1,8000)
            calls=[]
            def run(args,**kwargs):
                calls.append(args)
                if len(calls)==1:
                    return SimpleNamespace(returncode=0,stderr=json.dumps({
                        'input_i':'-30','input_tp':'-3','input_lra':'20',
                        'input_thresh':'-40','target_offset':'0'}))
                sf.write(args[-1],np.ones(8000)*.1,8000)
                return SimpleNamespace(returncode=0)
            self.assertTrue(normalize_audio(path,run=run))
            audio_filter=calls[1][calls[1].index('-af')+1]
            self.assertEqual(audio_filter,'volume=1.000000dB:precision=double')


if __name__=='__main__':unittest.main()
