import asyncio
import ast
import contextlib
import io
from pathlib import Path
import sys
from types import SimpleNamespace
import unittest

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools/voxcpm2'))
from dub_lifecycle import bounded_call, EngineStalled, stop_server


class Lifecycle(unittest.TestCase):
    def test_cancel_rpc_that_never_replies_has_a_bounded_exit(self):
        async def run():
            cancelled=[]
            async def stuck():
                try:
                    await asyncio.Event().wait()
                finally:
                    cancelled.append(True)
                    await asyncio.Event().wait()
            began=asyncio.get_running_loop().time()
            with self.assertRaises(EngineStalled):
                await bounded_call(stuck(),.01,cancel_grace=.01)
            self.assertLess(asyncio.get_running_loop().time()-began,.3)
            self.assertEqual(cancelled,[True])
            self.assertFalse([t for t in asyncio.all_tasks() if t is not asyncio.current_task() and not t.done()])
        asyncio.run(run())

    def test_restart_reuses_paths_and_never_changes_reference_even_at_batch_one(self):
        script=Path(__file__).resolve().parents[1]/'tools/voxcpm2/altyazi_oku.py'
        function=next(n for n in ast.parse(script.read_text(encoding='utf-8')).body
                      if isinstance(n,ast.FunctionDef) and n.name=='generate_with_fallback')
        scope={'asyncio':asyncio}
        exec(compile(ast.Module(body=[function],type_ignores=[]),str(script),'exec'),scope)
        args=SimpleNamespace(eszamanli=1,reference='unchanged-reference.wav')
        paths=['completed.wav','missing.wav'];calls=[]
        async def generate(options,cues,received,prompt):
            calls.append((list(received),options.reference))
            if len(calls)==1:
                received[1]='temporary-fallback.wav'
                raise EngineStalled('fixture')
            return 48000
        with contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(scope['generate_with_fallback'](args,[],paths,'',generate),48000)
        self.assertEqual(calls,[(['completed.wav','missing.wav'],'unchanged-reference.wav')]*2)
        async def always_stuck(*args):
            calls.append(True)
            raise EngineStalled('fixture')
        calls.clear()
        with contextlib.redirect_stdout(io.StringIO()),self.assertRaises(EngineStalled):
            scope['generate_with_fallback'](args,[],paths,'',always_stuck)
        self.assertEqual(len(calls),2)

    def test_successful_shutdown_does_not_touch_other_processes(self):
        class Server:
            stopped=False
            async def stop(self):self.stopped=True
        server=Server();asyncio.run(stop_server(server,.1))
        self.assertTrue(server.stopped)

    def test_cancel_during_shutdown_stops_only_owned_worker_and_remains_cancelled(self):
        class Process:
            alive=True
            def is_alive(self):return self.alive
            def terminate(self):self.alive=False
            def join(self,timeout):pass
        process=Process()
        class Server:
            servers=[SimpleNamespace(process=process)]
            async def stop(self):await asyncio.Event().wait()
        async def run():
            task=asyncio.create_task(stop_server(Server(),.1))
            await asyncio.sleep(.001)
            task.cancel()
            with self.assertRaises(asyncio.CancelledError):await task
        with contextlib.redirect_stdout(io.StringIO()):asyncio.run(run())
        self.assertFalse(process.is_alive())


if __name__=='__main__':unittest.main()
