"""Pure runtime scheduling, cached-reference and phase measurements."""
import asyncio
from pathlib import Path
import sys
from types import SimpleNamespace
import unittest
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools/voxcpm2'))
from dub_runtime import capacity, EngineSession, Phases
class RuntimeTests(unittest.TestCase):
    def test_capacity_is_bounded_by_free_memory_and_request(self):
        g=1024**3
        self.assertEqual(capacity(11*g,12*g,8)[0],8)
        self.assertEqual(capacity(9*g,12*g,8)[0],4)
        self.assertEqual(capacity(7.2*g,12*g,4)[0],2)
        self.assertEqual(capacity(6*g,12*g,8)[0],1)
        self.assertEqual(capacity(11*g,12*g,1)[0],1)
        self.assertLessEqual(capacity(7*g,12*g,8)[1],(7-.6)/12)
    def test_warm_engine_does_not_reload_to_grow_capacity_and_reduces_admission_for_a_single_tail(self):
        class Server:
            async def wait_for_ready(self):pass
            async def stop(self):pass
        calls=[]
        def factory(*args,**kwargs):calls.append(kwargs);return Server()
        args=SimpleNamespace(steps=15,eszamanli=4,batch_tokens=2048,max_model_len=2048,gpu_mem=.8,ready_timeout=1)
        session=EngineSession()
        try:
            with patch.dict(sys.modules,{'torch':SimpleNamespace(cuda=SimpleNamespace(mem_get_info=lambda:(11*1024**3,12*1024**3)))}):
                first=session.run(session.acquire(args,'model',factory,None,None))
                args.requested_concurrency=1
                self.assertIs(session.run(session.acquire(args,'model',factory,None,None)),first)
                self.assertEqual(args.eszamanli,1);self.assertEqual(len(calls),1)
                args.steps=10
                self.assertIsNot(session.run(session.acquire(args,'model',factory,None,None)),first)
                self.assertEqual(len(calls),2)
        finally:session.close()

    def test_reference_cache_reuses_only_exact_waveform_and_prompt(self):
        class Server:
            def __init__(self):self.calls=[]
            async def encode_latents(self,wav,fmt):self.calls.append(('encode',wav));return wav
            async def add_prompt(self,wav,fmt,text):self.calls.append(('add',text));return 'p'+str(len(self.calls))
            async def remove_prompt(self,pid):self.calls.append(('remove',pid))
            async def stop(self):self.calls.append(('stop',))
        session=EngineSession();session.server=Server();server=session.server;args=SimpleNamespace(ready_timeout=1)
        async def cases():
            a=await session.prepare_reference(args,b'a','first');self.assertEqual(await session.prepare_reference(args,b'a','first'),a)
            self.assertEqual(len(server.calls),2)
            await session.prepare_reference(args,b'b','second');self.assertEqual(server.calls[2],('remove',a[1]));self.assertEqual(server.calls[-1],('add','second'))
            await session.reset();self.assertIsNone(session.reference);self.assertIsNone(session.server)
        try:session.run(cases())
        finally:session.close()
    def test_phase_snapshot_includes_failed_work_without_counting_unstarted_stages(self):
        times=iter([1,2,5,7]);p=Phases(lambda:next(times))
        with self.assertRaises(ValueError):
            with p.measure('synthesis'):raise ValueError('failed')
        result=p.snapshot();self.assertEqual(result['synthesis_seconds'],3);self.assertEqual(result['wall_seconds'],6);self.assertNotIn('verification_seconds',result)
if __name__=='__main__':unittest.main()
