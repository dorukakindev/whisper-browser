import asyncio,json,sys,tempfile,unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
import numpy as np
import soundfile as sf
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools/voxcpm2'))
from dub_runtime import EngineSession
from dub_lifecycle import EngineStalled
from dub_quality import valid_audio,matches_recorded_duration
class AudioAudit602(unittest.TestCase):
 def test_tail_job_admission_does_not_under_size_the_warm_host(self):
  class Server:
   async def wait_for_ready(self):pass
   async def stop(self):pass
  calls=[]
  def factory(*a,**k):calls.append(k);return Server()
  args=SimpleNamespace(steps=15,eszamanli=1,requested_concurrency=1,configured_concurrency=4,batch_tokens=2048,max_model_len=2048,gpu_mem=.8,ready_timeout=1)
  rt=EngineSession()
  try:
   with patch.dict(sys.modules,{'torch':SimpleNamespace(cuda=SimpleNamespace(mem_get_info=lambda:(11*1024**3,12*1024**3)))}):
    first=rt.run(rt.acquire(args,'fixture',factory,None,None));self.assertEqual(calls[0]['max_num_seqs'],4);self.assertEqual(args.eszamanli,1)
    args.requested_concurrency=4;args.eszamanli=4;self.assertIs(rt.run(rt.acquire(args,'fixture',factory,None,None)),first);self.assertEqual(args.eszamanli,4);self.assertEqual(len(calls),1)
  finally:rt.close()
 def test_failed_verifier_close_remains_owned_and_prevents_a_second_engine(self):
  class Verifier:
   attempts=0
   async def close(self):self.attempts+=1;raise asyncio.TimeoutError()
  rt=EngineSession();v=Verifier();rt.verifier=v;calls=[]
  args=SimpleNamespace(steps=15,eszamanli=4,batch_tokens=2048,max_model_len=2048,gpu_mem=.8,ready_timeout=1)
  try:
   rt.run(rt.reset());self.assertEqual(rt.stuck_verifiers,[v])
   with self.assertRaises(EngineStalled):rt.run(rt.acquire(args,'fixture',lambda *a,**k:calls.append(k),None,None))
   self.assertEqual(calls,[]);self.assertEqual(rt.stuck_verifiers,[v]);self.assertGreaterEqual(v.attempts,2)
  finally:rt.close()
 def test_real_soundfile_truncated_payload_must_not_match_old_verification(self):
  with tempfile.TemporaryDirectory() as tmp:
   p=Path(tmp)/'cached.wav';sr=24000;sf.write(p,np.sin(np.arange(sr)*.1)*.1,sr)
   p.with_suffix('.json').write_text(json.dumps({'final_seconds':1}),encoding='utf-8')
   self.assertTrue(matches_recorded_duration(p,sf));data=p.read_bytes();p.write_bytes(data[:44+int((len(data)-44)*.6)//2*2])
   self.assertTrue(valid_audio(p,sf),'technical libsndfile validity alone is insufficient')
   self.assertFalse(matches_recorded_duration(p,sf))
 def test_invalid_recorded_duration_cannot_approve_audio(self):
  with tempfile.TemporaryDirectory() as tmp:
   p=Path(tmp)/'cached.wav';sf.write(p,np.ones(8000)*.1,8000)
   for value in [False,float('nan'),float('inf'),-1,0,'one']:
    p.with_suffix('.json').write_text(json.dumps({'final_seconds':value}),encoding='utf-8');self.assertFalse(matches_recorded_duration(p,sf))
if __name__=='__main__':unittest.main()
