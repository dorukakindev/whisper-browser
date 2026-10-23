import ast
import asyncio
import io
import contextlib
from pathlib import Path
from types import SimpleNamespace
import sys
import unittest

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tools'/'voxcpm2'))
from dub_timing import quality_retry
SCRIPT=ROOT/'tools'/'voxcpm2'/'altyazi_oku.py'

def verifier_class(async_module=asyncio):
    node=next(n for n in ast.parse(SCRIPT.read_text(encoding='utf-8')).body if isinstance(n,ast.ClassDef) and n.name=='SpeechVerifier')
    import json
    scope={'asyncio':async_module,'json':json}
    exec(compile(ast.Module(body=[node],type_ignores=[]),str(SCRIPT),'exec'),scope)
    return scope['SpeechVerifier']

class AudioRegressions(unittest.TestCase):
    def test_491_13_literal_braces_and_comparisons_are_not_deleted_from_speech(self):
        from dub_plan import parse_srt
        data='1\n00:00:00,000 --> 00:00:02,000\n{Mars} ve a < b > c. {\\an8}<i>Konuşma</i>\n\n'.encode('utf-8')
        self.assertEqual(parse_srt('fixture.srt',data)[0][2],'{Mars} ve a < b > c. Konuşma')

    def test_491_01_fit_setting_changes_speech_cache_identity(self):
        assignment=next(n for n in ast.walk(ast.parse(SCRIPT.read_text(encoding='utf-8'))) if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='settings' for t in n.targets))
        def identity(fit):
            args=SimpleNamespace(auto_fit=fit,timing_mode='clip',expression='reference',natural_speech=True,editor_identity='model',steps=15,cfg=1.65,temperature=.8,mode='hifi',max_generate_length=1024,verification='fast')
            return eval(compile(ast.Expression(assignment.value),str(SCRIPT),'eval'),{'args':args,'MODEL_REVISION':'rev','ref_hash':'ref','prompt_text':'prompt','SPOKEN_TEXT_VERSION':'fixture'})
        self.assertNotEqual(identity(True),identity(False))

    def test_491_02_failed_retry_cannot_erase_an_existing_candidate(self):
        async def scenario():
            calls=0
            async def generate(seed):
                nonlocal calls
                calls+=1
                if calls==2: raise asyncio.TimeoutError()
                return ['usable audio']
            best,metric=await quality_retry(generate,lambda raw:1,42,retries=1)
            self.assertEqual(best,['usable audio']);self.assertEqual(metric['attempts'],2)
            async def oom(seed):raise RuntimeError('CUDA out of memory')
            with self.assertRaisesRegex(RuntimeError,'out of memory'):await quality_retry(oom,lambda raw:0,42)
        asyncio.run(scenario())

    def test_491_03_queued_verifiers_stop_after_the_first_unavailable_result(self):
        async def scenario():
            writes=[]
            async def drain():await asyncio.sleep(0)
            async def readline():await asyncio.sleep(0);return b'{"error":"unavailable"}\n'
            verifier=verifier_class()('fixture')
            verifier.proc=SimpleNamespace(stdin=SimpleNamespace(write=writes.append,drain=drain),stdout=SimpleNamespace(readline=readline))
            with contextlib.redirect_stdout(io.StringIO()):
                results=await asyncio.gather(verifier.check('a.wav','A'),verifier.check('b.wav','B'))
            self.assertEqual(len(writes),1);self.assertTrue(all(r['status']=='unavailable' for r in results))
        asyncio.run(scenario())

    def test_491_04_verifier_shutdown_escalates_to_kill_instead_of_hanging(self):
        async def scenario():
            gate=asyncio.Event();calls=[]
            async def wait():await gate.wait();return 0
            async def bounded(coro,seconds):return await asyncio.wait_for(coro,min(seconds,.01))
            def kill():calls.append('kill');gate.set()
            proxy=SimpleNamespace(Lock=asyncio.Lock,wait_for=bounded,TimeoutError=asyncio.TimeoutError)
            verifier=verifier_class(proxy)('fixture');verifier.proc=SimpleNamespace(returncode=None,terminate=lambda:calls.append('terminate'),kill=kill,wait=wait)
            await asyncio.wait_for(verifier.close(),.05)
            self.assertEqual(calls,['terminate','kill'])
        asyncio.run(scenario())

if __name__=='__main__':unittest.main()
