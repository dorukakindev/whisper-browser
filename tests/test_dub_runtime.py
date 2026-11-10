"""Pure runtime scheduling, cached-reference and phase measurements."""
import asyncio
import contextlib
import io
import json
from pathlib import Path
import sys
from types import SimpleNamespace
import unittest
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools/voxcpm2'))
from dub_runtime import capacity, EngineSession, Phases, reference_call
class RuntimeTests(unittest.TestCase):
    def test_reference_timeout_names_the_rpc_and_never_caches_incomplete_reference(self):
        from dub_lifecycle import EngineStalled
        class Server:
            async def encode_latents(self, wav, fmt): await asyncio.Event().wait()
            async def add_prompt(self, *args): raise AssertionError('prompt must not start')
            async def stop(self): pass
        session=EngineSession();session.server=Server()
        args=SimpleNamespace(ready_timeout=.05,phases=Phases())
        output=io.StringIO()
        try:
            with contextlib.redirect_stdout(output), self.assertRaisesRegex(EngineStalled,'Reference encoding') as raised:
                session.run(session.prepare_reference(args,b'voice','prompt'))
            self.assertEqual(raised.exception.stage,'reference_encode')
            rows=[json.loads(line.split(' ',1)[1]) for line in output.getvalue().splitlines() if line.startswith('DUB_REFERENCE_ACTIVITY ')]
            self.assertEqual([r['state'] for r in rows],['start','timeout'])
            self.assertTrue(all(r['stage']=='reference_encode' for r in rows))
            self.assertIsNone(session.reference)
            self.assertGreater(args.phases.seconds['reference_encode'],0)
        finally:session.close()
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
    def test_transcript_change_replaces_prompt_without_encoding_the_same_voice_again(self):
        class Server:
            def __init__(self): self.encodes=[]; self.adds=[]; self.removes=[]
            async def encode_latents(self, wav, fmt):
                self.encodes.append(wav); return object()
            async def add_prompt(self, wav, fmt, text):
                self.adds.append(text); return 'prompt-'+str(len(self.adds))
            async def remove_prompt(self, pid): self.removes.append(pid)
            async def stop(self): pass
        session=EngineSession(); session.server=server=Server()
        args=SimpleNamespace(ready_timeout=1)
        async def cases():
            lat, pid=await session.prepare_reference(args,b'voice-a','first transcript')
            next_lat, next_pid=await session.prepare_reference(args,b'voice-a','corrected transcript')
            self.assertIs(next_lat,lat); self.assertNotEqual(next_pid,pid)
            self.assertEqual(server.encodes,[b'voice-a']); self.assertEqual(server.removes,[pid])
            isolated_lat, isolated_pid=await session.prepare_reference(args,b'voice-a',None)
            self.assertIs(isolated_lat,lat); self.assertIsNone(isolated_pid)
            self.assertEqual(server.removes,[pid,next_pid]); self.assertEqual(len(server.encodes),1)
            changed_lat,_=await session.prepare_reference(args,b'voice-b',None)
            self.assertIsNot(changed_lat,lat); self.assertEqual(server.encodes,[b'voice-a',b'voice-b'])
            await session.reset(); self.assertIsNone(session.reference)
        try: session.run(cases())
        finally: session.close()
if __name__=='__main__':unittest.main()
