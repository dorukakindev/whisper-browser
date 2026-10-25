import sys
import tempfile
import unittest
from pathlib import Path
import numpy as np
import soundfile as sf
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools/voxcpm2'))
from dub_timing import build_narration_timeline
class NarrationTests(unittest.TestCase):
 def test_video_gaps_are_removed_but_words_are_not_time_compressed(self):
  with tempfile.TemporaryDirectory() as folder:
   paths=[]
   for i in range(2):
    p=Path(folder)/f'{i}.wav';sf.write(p,np.r_[np.zeros(800),np.ones(8000)*.1,np.zeros(800)],8000);paths.append(p)
   audio,report=build_narration_timeline([(10000,20000,'Birinci cümle.'),(60000,90000,'İkinci cümle.')],paths,8000)
   self.assertLess(len(audio)/8000,3)
   self.assertEqual(report['groups'][0]['start_seconds'],0)
   self.assertEqual(sum(abs(audio)>.05),16000)
   self.assertTrue(all(row['cut_frames']==0 and row['tempo']==1 for row in report['groups']))
 def test_wrong_audio_rate_is_rejected(self):
  with tempfile.TemporaryDirectory() as folder:
   p=Path(folder)/'wrong.wav';sf.write(p,np.ones(1000)*.1,16000)
   with self.assertRaises(ValueError):build_narration_timeline([(0,1000,'Metin.')],[p],8000)
if __name__=='__main__':unittest.main()
