import asyncio
from pathlib import Path
import sys
import unittest
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools' / 'voxcpm2'))
from dub_lifecycle import EngineStalled, stop_server
from dub_runtime import EngineSession


class ShutdownTests(unittest.TestCase):
    def test_failed_child_cleanup_still_attempts_every_other_owned_child(self):
        class Process:
            def __init__(self, denied=False, stuck=False):
                self.alive=True; self.denied=denied; self.stuck=stuck; self.events=[]
            def is_alive(self): return self.alive
            def terminate(self): self.events.append('terminate')
            def join(self, timeout): self.events.append(('join', timeout))
            def kill(self):
                self.events.append('kill')
                if self.denied: raise PermissionError('controlled child denial')
                self.alive=self.stuck
        class Server:
            async def stop(self): raise self.failure
        for denied in (False, True):
            for cancelled in (False, True):
                with self.subTest(denied=denied, cancelled=cancelled):
                    blocked, healthy=Process(denied=denied, stuck=True),Process()
                    server=Server();server.servers=[SimpleNamespace(process=p) for p in (blocked,healthy)]
                    server.failure=asyncio.CancelledError() if cancelled else RuntimeError('controlled failed RPC')
                    expected=asyncio.CancelledError if cancelled else PermissionError if denied else EngineStalled
                    with self.assertRaises(expected):
                        asyncio.run(stop_server(server))
                    self.assertEqual(healthy.events, ['terminate', ('join', 2), 'kill', ('join', 2)])
                    self.assertFalse(healthy.alive)
                    self.assertTrue(blocked.alive, 'The unresolved child must still be reported to the owner')

    def test_failed_fallback_kill_is_not_reported_as_a_stopped_engine(self):
        class Process:
            def __init__(self): self.events=[]
            def is_alive(self): return True
            def terminate(self): self.events.append('terminate')
            def kill(self): self.events.append('kill')
            def join(self, timeout): self.events.append(('join', timeout))
        class Server:
            async def stop(self): raise self.failure
        for error in [RuntimeError('controlled failed RPC'), asyncio.CancelledError()]:
            proc=Process(); server=Server();server.failure=error
            server.servers=[type('Worker', (), {'process':proc})()]
            expected=asyncio.CancelledError if isinstance(error,asyncio.CancelledError) else EngineStalled
            with self.assertRaises(expected): asyncio.run(stop_server(server))
            self.assertEqual(proc.events, ['terminate', ('join', 2), 'kill', ('join', 2)])

    def test_reset_retains_unstopped_server_for_retry_instead_of_losing_gpu_ownership(self):
        class Process:
            alive=True
            def is_alive(self): return self.alive
            def terminate(self): pass
            def kill(self): raise PermissionError('controlled process denial')
            def join(self, timeout): pass
        class Server:
            calls=0
            allow_stop=False
            async def stop(self):
                self.calls+=1
                if not self.allow_stop: raise RuntimeError('controlled failed RPC')
                proc.alive=False
        proc=Process(); server=Server()
        server.servers=[type('Worker', (), {'process':proc})()]
        session=EngineSession(); session.server=server
        try:
            with self.assertRaises(PermissionError): session.run(session.reset())
            self.assertIs(session.server, server, 'An unconfirmed stop must retain its exact owned engine')
            self.assertIsNone(session.key)
            created=[]
            args=SimpleNamespace(steps=15,batch_tokens=2048,max_model_len=2048,gpu_mem=.8,eszamanli=1)
            with self.assertRaises(PermissionError):
                session.run(session.acquire(args,'model',lambda *a,**kw:created.append(kw),None,None))
            self.assertEqual(created,[], 'Another GPU engine must not start while its predecessor is alive')
            self.assertIs(session.server,server)
            server.allow_stop=True
            session.run(session.reset())
            self.assertEqual(server.calls,3);self.assertIsNone(session.server);self.assertFalse(proc.alive)
        finally:
            session.close()


if __name__ == '__main__': unittest.main()
