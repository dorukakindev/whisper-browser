"""Exercise production generation orchestration with a controlled local engine."""
import ast
import asyncio
import contextlib
import io
import json
from pathlib import Path
import sys
import tempfile
import time
from types import SimpleNamespace
import unittest
from unittest.mock import patch

import numpy as np
import soundfile as sf

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools' / 'voxcpm2'))
from dub_timing import quality_retry, available_window
from dub_quality import valid_audio
from dub_finish import spoken_text, finish_audio

SCRIPT = Path(__file__).resolve().parents[1] / 'tools' / 'voxcpm2' / 'altyazi_oku.py'


class Server:
    sample_rate = 8000
    def __init__(self): self.calls = []; self.seeds = []; self.stopped = False; self.fail = set()
    async def wait_for_ready(self): pass
    async def encode_latents(self, *a): return None
    async def add_prompt(self, *a): return 'prompt'
    async def stop(self): self.stopped = True
    async def generate(self, text, **kwargs):
        self.calls.append(text)
        self.seeds.append(kwargs['seed'])
        if text in self.fail: raise ValueError('controlled failure')
        yield np.ones(4000 if text == 'Short.' else 16000, dtype='float32')*.1


class Verifier:
    checks = []
    def __init__(self, *args): pass
    async def check(self, path, text, **kwargs):
        self.checks.append(text)
        return {'status':'passed','similarity':1,'review':False,'missing_numbers':[]}
    async def close(self): pass


class GenerationTests(unittest.TestCase):
    def test_oom_restarts_with_smaller_batches_but_other_errors_do_not_loop(self):
        function = next(n for n in ast.parse(SCRIPT.read_text(encoding='utf-8')).body
                        if isinstance(n, ast.FunctionDef) and n.name == 'generate_with_fallback')
        scope = {'asyncio':asyncio}
        exec(compile(ast.Module(body=[function],type_ignores=[]),str(SCRIPT),'exec'),scope)
        seen=[]
        async def generate(args,cues,paths,prompt):
            seen.append(args.eszamanli)
            if args.eszamanli>2:
                paths[0]='temporary failure path'
                raise RuntimeError('CUDA out of memory')
            self.assertEqual(paths,['original'])
            return 48000
        args=SimpleNamespace(eszamanli=8)
        with contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(scope['generate_with_fallback'](args,[],['original'],'',generate),48000)
        self.assertEqual(seen,[8,4,2])
        async def invalid(*args): raise ValueError('wrong reference')
        with self.assertRaisesRegex(ValueError,'wrong reference'):
            scope['generate_with_fallback'](args,[],['original'],'',invalid)

    def run_generation(self, folder, server, texts, auto_fit=False, verification='fast', natural=False, manual=False, force=False):
        function = next(n for n in ast.parse(SCRIPT.read_text(encoding='utf-8')).body
                        if isinstance(n, ast.AsyncFunctionDef) and n.name == 'uret')
        self.rewrites=[]
        async def rewrite(*args, **kwargs):
            self.rewrites.append((args,kwargs))
            return 'Short.'
        scope = dict(asyncio=asyncio, np=np, sf=sf, Path=Path, time=time, json=json,
            MODEL_ID='fixture', MODEL_REVISION='fixture', SAMPLE_RATE=48000, quality_retry=quality_retry,
            assess_chunk=lambda *a:(0,{}), prepare_audio=lambda audio, rate:audio,
            available_window=available_window, valid_audio=valid_audio, spoken_text=spoken_text, finish_audio=finish_audio,
            SpeechVerifier=Verifier, rewrite_for_window=rewrite)
        exec(compile(ast.Module(body=[function],type_ignores=[]),str(SCRIPT),'exec'),scope)
        ref = folder/'reference.wav'; ref.write_bytes(b'fixture')
        args = SimpleNamespace(steps=15,eszamanli=2,batch_tokens=2048,max_model_len=2048,
            gpu_mem=.8,ready_timeout=1,reference=ref,verify_python='fixture',
            force_groups={'1'} if force else set(),regeneration_seed=123,group_seeds=[42+i for i in range(len(texts))],
            group_keys=[str(i+1) for i in range(len(texts))],bosluk_pay_ms=0,end_limit_ms=None,
            retry=1,request_timeout=1,seed=42,temperature=.8,cfg=1.65,max_generate_length=1024,
            verification=verification,auto_fit=auto_fit,report_dir=folder, natural_speech=natural,manual_groups={'1'} if manual else set())
        paths = [folder/f'{i}.wav' for i in range(len(texts))]
        modules = {'huggingface_hub':SimpleNamespace(snapshot_download=lambda *a,**k:'fixture'),
                   'nanovllm_voxcpm':SimpleNamespace(VoxCPM=SimpleNamespace(from_pretrained=lambda *a,**k:server))}
        cues = [(i*1000,(i+1)*1000,text) for i,text in enumerate(texts)]
        with patch.dict(sys.modules,modules), contextlib.redirect_stdout(io.StringIO()):
            rate = asyncio.run(scope['uret'](args,cues,paths,'prompt'))
        return rate,args,paths

    def test_failure_retains_other_pieces_and_resume_generates_only_missing(self):
        with tempfile.TemporaryDirectory() as d:
            folder=Path(d); first=Server(); first.fail={'Broken.'}
            rate,args,paths=self.run_generation(folder,first,['Good.','Broken.'])
            self.assertEqual(rate,8000)
            self.assertEqual([r['status'] for r in sorted(args.group_results,key=lambda r:r['group'])],['ready','failed'])
            self.assertTrue(valid_audio(paths[1],sf))
            self.assertFalse((folder/'1.wav').exists(), 'silence must never become a successful cache hit')
            second=Server()
            _,args,_=self.run_generation(folder,second,['Good.','Broken.'])
            self.assertEqual(second.calls,['Broken.'])
            self.assertTrue(first.stopped and second.stopped)

    def test_491_12_explicit_regeneration_requests_a_new_acoustic_seed(self):
        with tempfile.TemporaryDirectory() as d:
            server=Server();self.run_generation(Path(d),server,['Good.'],force=True)
            self.assertEqual(server.seeds,[165])
        with tempfile.TemporaryDirectory() as d:
            server=Server();self.run_generation(Path(d),server,['Good.'])
            self.assertEqual(server.seeds,[42])

    def test_duration_edit_keeps_actual_text_and_detailed_verification(self):
        with tempfile.TemporaryDirectory() as d:
            server=Server(); Verifier.checks=[]
            _,args,paths=self.run_generation(Path(d),server,['This is a deliberately long sentence.'],True,'detailed')
            self.assertEqual(server.calls,['This is a deliberately long sentence.','Short.'])
            record=json.loads(paths[0].with_suffix('.json').read_text())
            self.assertEqual(self.rewrites[0][1]['measured'],2)
            self.assertTrue(record['rewritten'])
            self.assertEqual(record['text'],'Short.')
            self.assertEqual(Verifier.checks,['Short.'])
            self.assertEqual(sf.info(paths[0]).frames,4000)



    def test_natural_second_pass_precedes_synthesis_but_manual_text_is_locked(self):
        with tempfile.TemporaryDirectory() as d:
            server=Server()
            _,args,paths=self.run_generation(Path(d),server,['Written style sentence.'],natural=True)
            self.assertEqual(server.calls,['Short.'])
            self.assertEqual(self.rewrites[0][1]['mode'],'natural')
        with tempfile.TemporaryDirectory() as d:
            server=Server()
            self.run_generation(Path(d),server,['Manually chosen wording must stay intact.'],auto_fit=True,natural=True,manual=True)
            self.assertEqual(self.rewrites,[])
            self.assertEqual(server.calls,['Manually chosen wording must stay intact.'])

if __name__ == '__main__': unittest.main()
