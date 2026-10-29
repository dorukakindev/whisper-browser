import json,sys,tempfile,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools/voxcpm2'))
import dub_quality as Q
import numpy as np,soundfile as sf
class Cache796(unittest.TestCase):
 def test_replaced_audible_wave_cannot_inherit_ready_metadata(self):
  with tempfile.TemporaryDirectory() as d:
   p=Path(d)/'ses.wav';sf.write(p,np.sin(np.arange(8000)*.1)*.1,16000)
   record={'text':'Merhaba.','status':'ready','verification':{'status':'not_checked'},'audioIdentity':Q.audio_identity(p)}
   p.with_suffix('.json').write_text(json.dumps(record),encoding='utf8')
   self.assertTrue(Q.matches_recorded_audio(p));self.assertEqual(Q.cached_record(p)['status'],'ready')
   sf.write(p,np.sin(np.arange(8000)*.2)*.1,16000)
   self.assertTrue(Q.valid_audio(p,sf));self.assertFalse(Q.matches_recorded_audio(p));self.assertEqual(Q.cached_record(p)['status'],'review')
 def test_legacy_wave_kept_for_listening_but_not_claimed_ready(self):
  with tempfile.TemporaryDirectory() as d:
   p=Path(d)/'eski.wav';sf.write(p,np.ones(8000)*.1,16000)
   p.with_suffix('.json').write_text(json.dumps({'text':'Merhaba.','status':'ready','verification':{'status':'passed','recognizedText':'Merhaba.'}}))
   before=p.read_bytes();self.assertTrue(Q.matches_recorded_audio(p));self.assertEqual(Q.cached_record(p)['status'],'review');self.assertEqual(p.read_bytes(),before)
if __name__=='__main__':unittest.main()
