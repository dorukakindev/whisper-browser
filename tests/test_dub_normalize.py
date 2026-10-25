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
import soundfile as sf
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools/voxcpm2'))
from dub_normalize import loudnorm_audio

class Normalize(unittest.TestCase):
    def fixture(self,root):
        source=Path(root)/'Türkçe ses.wav'
        sf.write(source,(np.sin(np.arange(24000)*2*math.pi*440/24000)*.1).astype('float32'),24000)
        return source
    def test_timeout_or_failed_second_pass_preserves_original_and_removes_temp(self):
        for failure in ('timeout','invalid','locked'):
            with self.subTest(failure=failure),tempfile.TemporaryDirectory() as root:
                source=self.fixture(root);before=source.read_bytes();calls=[]
                def run(cmd,**options):
                    calls.append((cmd,options));self.assertTrue(0<options['timeout']<=1800)
                    if len(calls)==1:
                        stats=dict(input_i='-20',input_tp='-2',input_lra='1',input_thresh='-30',target_offset='0')
                        return SimpleNamespace(returncode=0,stderr='[loudnorm] '+json.dumps(stats))
                    sf.write(cmd[-1],np.zeros(100,dtype='float32'),48000)
                    if failure=='timeout':raise subprocess.TimeoutExpired(cmd,options['timeout'])
                    if failure=='locked':sf.write(cmd[-1],np.zeros(48000,dtype='float32'),48000)
                    return SimpleNamespace(returncode=0,stderr='')
                with patch('dub_normalize.os.replace',side_effect=PermissionError('locked')):
                    self.assertIsNone(loudnorm_audio(source,runner=run))
                self.assertEqual(source.read_bytes(),before)
                self.assertEqual(list(Path(root).glob('*.norm-*.wav')),[])
    def test_nonfinite_loudness_and_missing_ffmpeg_are_safe_fallbacks(self):
        with tempfile.TemporaryDirectory() as root:
            source=self.fixture(root);before=source.read_bytes()
            def invalid(*args,**kwargs):return SimpleNamespace(returncode=0,stderr=json.dumps(dict(input_i='-inf',input_tp='-inf',input_lra='0',input_thresh='-inf',target_offset='inf')))
            self.assertIsNone(loudnorm_audio(source,runner=invalid))
            def missing(*args,**kwargs):raise FileNotFoundError('ffmpeg')
            self.assertIsNone(loudnorm_audio(source,runner=missing));self.assertEqual(source.read_bytes(),before)
    def test_real_ffmpeg_two_pass_keeps_duration_and_replaces_only_valid_wav(self):
        sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'backend'))
        import transcribe
        ffmpeg=transcribe.find_ffmpeg();self.assertTrue(ffmpeg,'ffmpeg required')
        with tempfile.TemporaryDirectory() as root:
            source=self.fixture(root)
            def run(cmd,**options):return subprocess.run([ffmpeg,*cmd[1:]],**options)
            self.assertEqual(loudnorm_audio(source,runner=run),source)
            info=sf.info(source);self.assertEqual(info.samplerate,48000);self.assertAlmostEqual(info.duration,1,places=2)
            self.assertEqual(list(Path(root).glob('*.norm-*.wav')),[])

if __name__=='__main__':unittest.main()
