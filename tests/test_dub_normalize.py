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
    def test_real_quiet_loud_and_stereo_reach_target_without_clipping_or_time_change(self):
        sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'backend'))
        import transcribe
        ffmpeg=transcribe.find_ffmpeg();self.assertTrue(ffmpeg,'ffmpeg required')
        def run(cmd,**options):return subprocess.run([ffmpeg,*cmd[1:]],**options)
        with tempfile.TemporaryDirectory() as root:
            sr=24000;t=np.arange(sr*4)/sr
            # Stable gated signal isolates gain/channel behavior from model randomness.
            wave=(np.sin(t*2*math.pi*440)*(.07+.03*np.sin(t*2*math.pi*2))).astype('float32')
            for name,gain,stereo in [('quiet',.1,False),('loud',8,False),('stereo',1,True)]:
                with self.subTest(case=name):
                    audio=wave*gain
                    if stereo:audio=np.repeat(audio[:,None],2,axis=1)
                    source=Path(root)/(name+'.wav');sf.write(source,audio,sr,subtype='FLOAT')
                    self.assertEqual(loudnorm_audio(source,runner=run),source)
                    info=sf.info(source);samples,_=sf.read(source,dtype='float32')
                    self.assertEqual(info.channels,2 if stereo else 1)
                    self.assertAlmostEqual(info.duration,4,places=4)
                    self.assertTrue(np.isfinite(samples).all());self.assertLess(float(np.abs(samples).max()),1)
                    result=run(['ffmpeg','-hide_banner','-nostats','-i',str(source),'-af',
                        'loudnorm=I=-20:TP=-2:LRA=11:print_format=json','-f','null','-'],
                        capture_output=True,text=True,encoding='utf-8',errors='replace',timeout=30)
                    self.assertEqual(result.returncode,0,result.stderr[-500:])
                    stats=json.JSONDecoder().raw_decode(result.stderr[result.stderr.rfind('{'):])[0]
                    self.assertLessEqual(abs(float(stats['input_i'])+20),.5)
                    self.assertLessEqual(float(stats['input_tp']),-1.9)

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
