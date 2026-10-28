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
from dub_quality import valid_audio, generation_status
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
    def test_rejected_continuation_retries_isolated_without_changing_parallel_prompt(self):
        class ConditioningServer(Server):
            def __init__(self): super().__init__(); self.conditioning=[]
            async def generate(self, text, **kwargs):
                self.conditioning.append((text, kwargs['prompt_id'], kwargs['ref_audio_latents']))
                yield np.ones(16000, dtype='float32') * (.15 if kwargs['prompt_id'] is None else .1)
            async def encode_latents(self, *_): return 'same-reference'
        class RetryVerifier(Verifier):
            async def check(self, path, text, **_):
                passed=text == 'Other.' or '-verify' in str(path)
                return {'status':'passed' if passed else 'review','review':not passed,'similarity':1 if passed else 0}
        with tempfile.TemporaryDirectory() as folder:
            server=ConditioningServer()
            _,args,paths=self.run_generation(Path(folder),server,['Good.','Other.'],verification='detailed',verifier=RetryVerifier)
            self.assertEqual([prompt for text,prompt,_ in server.conditioning if text=='Good.'],['prompt',None])
            self.assertEqual([prompt for text,prompt,_ in server.conditioning if text=='Other.'],['prompt'])
            self.assertTrue(all(ref=='same-reference' for _,_,ref in server.conditioning))
            records={row['key']:row for row in args.group_results}
            self.assertEqual(records['1']['referenceMode'],'isolated')
            self.assertEqual(records['2']['referenceMode'],'continuation')
            self.assertTrue(all(row['status']=='ready' for row in records.values()))
            expected,_=finish_audio(np.ones(16000,dtype='float32')*.15,8000)
            np.testing.assert_allclose(sf.read(paths[0])[0],expected,atol=1/32768)

    def test_isolated_retry_rejected_by_semantic_gate_preserves_first_wave(self):
        class DifferentRetry(Server):
            async def generate(self,text,**kwargs):
                yield np.ones(16000,dtype='float32')*(.15 if kwargs['prompt_id'] is None else .1)
        class Reject(Verifier):
            async def check(self,path,*_,**__):
                return {'status':'review','review':True,'similarity':.99 if '-verify' in str(path) else .5,'lost_negation':True}
        with tempfile.TemporaryDirectory() as folder:
            _,args,paths=self.run_generation(Path(folder),DifferentRetry(),['Good.'],verification='detailed',verifier=Reject)
            self.assertEqual(args.group_results[0]['status'],'review')
            self.assertEqual(args.group_results[0]['referenceMode'],'continuation')
            expected,_=finish_audio(np.ones(16000,dtype='float32')*.1,8000)
            np.testing.assert_allclose(sf.read(paths[0])[0],expected,atol=1/32768)
            self.assertFalse(list(Path(folder).glob('*-verify.wav')))

    def test_passed_continuation_does_not_request_alternative(self):
        server=Server()
        with tempfile.TemporaryDirectory() as folder:
            _,args,_=self.run_generation(Path(folder),server,['Good.'],verification='detailed')
            self.assertEqual(server.calls,['Good.'])
            self.assertEqual(args.group_results[0]['referenceMode'],'continuation')
            self.assertNotIn('verificationRetryMode',args.group_results[0])

    def test_clipped_verification_retry_cannot_pass_after_peak_finishing(self):
        class ClippedRetry(Server):
            async def generate(self, text, **kwargs):
                yield np.ones(16000, dtype='float32') * (1 if kwargs['prompt_id'] is None else .1)
        class PassedSecond(Verifier):
            def __init__(self, *_): self.count = 0
            async def check(self, *_args, **_kwargs):
                self.count += 1
                return {'status':'review' if self.count == 1 else 'passed', 'review':self.count == 1}
        with tempfile.TemporaryDirectory() as folder:
            _, args, paths = self.run_generation(Path(folder), ClippedRetry(), ['Good.'],
                verification='detailed', verifier=PassedSecond,
                assessor=lambda raw, *_: (int(np.max(np.abs(raw)) >= .999), {}))
            self.assertEqual(args.group_results[0]['status'], 'review')
            self.assertLess(float(np.max(np.abs(sf.read(paths[0])[0]))), .2)

    def test_oversized_source_cue_is_bounded_before_first_model_request(self):
        text = 'Bu cümlede bütün ayrıntıları birlikte değerlendirmeye devam ediyoruz. ' * 9
        with tempfile.TemporaryDirectory() as folder:
            server = Server()
            Verifier.checks.clear()
            _, args, paths = self.run_generation(Path(folder), server, [text], verification='detailed', timing_mode='video')
            self.assertGreater(len(server.calls), 1)
            self.assertTrue(all(len(part) <= 420 for part in server.calls))
            self.assertEqual(' '.join(server.calls).split(), text.split())
            self.assertEqual(Verifier.checks, [text])
            self.assertEqual(args.group_results[0]['key'], '1')
            self.assertEqual(args.group_results[0]['status'], 'ready')
            self.assertTrue(paths[0].is_file())

    def test_delivery_tag_is_not_verification_text_and_uses_reference_only(self):
        class DeliveryServer(Server):
            async def generate(self,text,**kwargs):
                self.prompt_id=kwargs['prompt_id']
                async for part in super().generate(text,**kwargs): yield part
        delivery={'energy':'high','variation':'varied','pauses':'normal'}
        with tempfile.TemporaryDirectory() as d:
            server=DeliveryServer(); Verifier.checks.clear()
            _,args,_=self.run_generation(Path(d),server,['Good.'],verification='detailed',delivery=[delivery])
            self.assertIn('(Speaking',server.calls[0])
            self.assertTrue(server.calls[0].endswith('Good.'))
            self.assertIsNone(server.prompt_id)
            self.assertEqual(Verifier.checks,['Good.'])
            self.assertEqual(args.group_results[0]['delivery'],delivery)

    def test_unknown_auto_group_keeps_reference_only_conditioning(self):
        class DeliveryServer(Server):
            def __init__(self): super().__init__();self.prompts=[]
            async def add_prompt(self,*_args): raise AssertionError('auto must not add a continuation prompt')
            async def generate(self,text,**kwargs):
                self.prompts.append(kwargs['prompt_id'])
                async for part in super().generate(text,**kwargs): yield part
        delivery={'energy':'high','variation':'varied','pauses':'normal'}
        with tempfile.TemporaryDirectory() as d:
            server=DeliveryServer()
            self.run_generation(Path(d),server,['Good.','Uncertain.'],delivery=[delivery,None],automatic=True)
            self.assertEqual(server.prompts,[None,None])
            self.assertEqual(server.calls[1],'Uncertain.')
    def test_slow_video_mode_does_not_shorten_a_complete_translation(self):
        with tempfile.TemporaryDirectory() as temp:
            server=Server()
            text='Bu tam cümlenin anlamı sırf kısa bir zaman aralığına sığdırmak için değiştirilmemeli.'
            self.run_generation(Path(temp),server,[text],auto_fit=True,timing_mode='video')
            self.assertEqual(server.calls,[text])
            self.assertEqual(self.rewrites,[])

    def test_stalled_last_request_keeps_completed_cache_for_same_reference(self):
        from dub_lifecycle import EngineStalled
        class Stalled(Server):
            async def generate(self,text,**kwargs):
                if text == 'Broken.':
                    try:
                        await asyncio.Event().wait()
                    finally:
                        await asyncio.Event().wait()  # Worker never acknowledges cancel.
                async for part in super().generate(text,**kwargs):
                    yield part
        with tempfile.TemporaryDirectory() as temp:
            folder=Path(temp);server=Stalled()
            from dub_lifecycle import bounded_call as real_bound
            async def controlled_bound(awaitable, timeout, cancel_grace=3):
                # Production still owns the timeout/cancellation path. Only
                # start the tiny stall deadline after healthy work is durable.
                task=asyncio.ensure_future(awaitable)
                deadline=asyncio.get_running_loop().time()+2
                while not task.done() and not valid_audio(folder/'0.wav',sf):
                    if asyncio.get_running_loop().time()>deadline:
                        task.cancel()
                        raise AssertionError('Healthy fixture failed to install its cache before the controlled stall')
                    await asyncio.sleep(0)
                return await real_bound(task, .01 if not task.done() else timeout, cancel_grace=.01)
            with patch('dub_timing.bounded_call',controlled_bound), self.assertRaises(EngineStalled):
                self.run_generation(folder,server,['Good.','Broken.'])
            self.assertTrue(server.stopped)
            self.assertTrue(valid_audio(folder/'0.wav',sf))
            replacement=Server()
            _,args,paths=self.run_generation(folder,replacement,['Good.','Broken.'])
            self.assertEqual(replacement.calls,['Broken.'])
            self.assertTrue(all(valid_audio(p,sf) for p in paths))

    def test_retry_passes_all_gates_instead_of_chasing_token_similarity(self):
        for status, review, similarity, expected, extra in [
                ('passed',False,.90,'passed',{}),
                ('review',True,.99,'review',{'added_numbers':['17']}),
                ('review',True,.99,'review',{'percentage_mismatch':True}),
                ('review',True,.99,'review',{'semantic_mismatch':True}),
                ('unavailable',False,1,'review',{})]:
            class CandidateVerifier(Verifier):
                count = 0
                async def check(self,*args,**kwargs):
                    self.count += 1
                    return ({'status':'review','review':True,'similarity':.95,'missing_numbers':['12']}
                            if self.count == 1 else {'status':status,'review':review,'similarity':similarity,**extra})
            with self.subTest(status=status,extra=extra), tempfile.TemporaryDirectory() as temp:
                _,args,_=self.run_generation(Path(temp),Server(),['Good.'],verification='detailed',verifier=CandidateVerifier)
                self.assertEqual(args.group_results[0]['verification']['status'],expected)
                self.assertEqual(args.group_results[0]['verification'].get('missing_numbers'),None if expected=='passed' else ['12'])

    def test_optional_verification_retry_failure_preserves_first_audio(self):
        class RejectVerifier(Verifier):
            async def check(self,*args,**kwargs):
                return {'status':'review','review':True,'similarity':.7}
        class RetryFailure(Server):
            async def generate(self,text,**kwargs):
                if kwargs['prompt_id'] is None:
                    raise ValueError('controlled retry failure')
                async for part in super().generate(text,**kwargs):
                    yield part
        with tempfile.TemporaryDirectory() as temp:
            _,args,paths=self.run_generation(Path(temp),RetryFailure(),['Good.'],verification='detailed',verifier=RejectVerifier)
            self.assertEqual(args.group_results[0]['status'],'review')
            self.assertEqual(args.group_results[0]['verification_retry_error'],'ValueError')
            self.assertEqual(sf.info(paths[0]).frames,16000)
            self.assertFalse(list(Path(temp).glob('*-verify.wav')))

    def test_interrupted_verification_keeps_real_speech_through_engine_restarts(self):
        from dub_lifecycle import EngineStalled
        class RejectVerifier(Verifier):
            async def check(self, *args, **kwargs):
                return {'status': 'review', 'review': True, 'similarity': .7}
        for failure in (EngineStalled('controlled stall'), RuntimeError('CUDA out of memory')):
            class RetryFailure(Server):
                async def generate(self, text, **kwargs):
                    if kwargs['prompt_id'] is None:
                        raise failure
                    async for part in super().generate(text, **kwargs):
                        yield part
            with self.subTest(failure=type(failure).__name__), tempfile.TemporaryDirectory() as temp:
                _, args, paths = self.run_generation(Path(temp), RetryFailure(), ['Good.'],
                    verification='detailed', verifier=RejectVerifier, fallback=True)
                self.assertEqual(sf.info(paths[0]).frames, 16000)
                self.assertEqual(args.group_results[0]['status'], 'review')
                self.assertEqual(args.group_results[0]['recoveryReason'], 'verification_interrupted')
                self.assertTrue(args.group_results[0]['regenerationFailed'])
                self.assertFalse(list(Path(temp).glob('*.tmp.wav')))

    def test_cancelled_optional_verification_preserves_candidate_but_propagates_cancel(self):
        class RejectVerifier(Verifier):
            async def check(self, *args, **kwargs):
                return {'status': 'review', 'review': True, 'similarity': .7}
        class CancelRetry(Server):
            async def generate(self, text, **kwargs):
                if kwargs['prompt_id'] is None:
                    raise asyncio.CancelledError()
                async for part in super().generate(text, **kwargs):
                    yield part
        with tempfile.TemporaryDirectory() as temp:
            with self.assertRaises(asyncio.CancelledError):
                self.run_generation(Path(temp), CancelRetry(), ['Good.'],
                    verification='detailed', verifier=RejectVerifier)
            path = Path(temp)/'0.wav'
            self.assertEqual(sf.info(path).frames, 16000)
            record = json.loads(path.with_suffix('.json').read_text(encoding='utf-8'))
            self.assertEqual(record['status'], 'review')
            self.assertEqual(record['verification']['status'], 'review')
            self.assertFalse(list(Path(temp).glob('*.tmp.wav')))

    def test_long_truncation_recovers_with_verified_smaller_contexts(self):
        class TruncationVerifier(Verifier):
            async def check(self, path, text, **kwargs):
                return {'status': 'review' if len(text)>280 else 'passed',
                        'similarity': .5 if len(text)>280 else 1}
        # Combined recovery is longer text too: emulate ASR seeing all words
        # only after it has received both successful smaller requests.
        class RecoveryVerifier(TruncationVerifier):
            good = 0
            async def check(self, path, text, **kwargs):
                if len(text)<=280:
                    self.good += 1
                if self.good >= 2:
                    return {'status':'passed','similarity':1}
                return await super().check(path, text, **kwargs)
        with tempfile.TemporaryDirectory() as temp:
            text = 'A complete sentence should retain its original meaning. ' * 7
            server = Server()
            _, args, _ = self.run_generation(Path(temp), server, [text], verification='detailed', verifier=RecoveryVerifier, manual=True)
            self.assertTrue(args.group_results[0]['recovery']['verified'])
            self.assertEqual(args.group_results[0]['verification']['status'], 'passed')
            self.assertEqual(' '.join(server.calls[2:]), text.strip())

    def test_stalled_last_group_restart_does_not_repeat_the_same_acoustic_seed(self):
        from dub_lifecycle import EngineStalled
        function=next(n for n in ast.parse(SCRIPT.read_text(encoding='utf-8')).body if isinstance(n,ast.FunctionDef) and n.name=='generate_with_fallback')
        scope={'asyncio':asyncio};exec(compile(ast.Module(body=[function],type_ignores=[]),str(SCRIPT),'exec'),scope)
        args=SimpleNamespace(eszamanli=4,group_seeds=[42],group_keys=['1'],force_groups=set())
        seen=[]
        async def generate(args,cues,paths,prompt):
            seen.append((args.eszamanli,args.group_seeds[0]))
            if len(seen)==1:raise EngineStalled('last group timeout')
            return 8000
        self.assertEqual(scope['generate_with_fallback'](args,[],[],None,generate),8000)
        self.assertEqual(seen,[(4,42),(2,100045)])

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

    def test_metadata_write_failure_cannot_attach_old_ready_to_new_wave(self):
        from dub_quality import cached_record
        class Different(Server):
            async def generate(self, *args, **kwargs):
                async for part in super().generate(*args, **kwargs): yield part*2
        with tempfile.TemporaryDirectory() as tmp:
            folder=Path(tmp)
            self.run_generation(folder,Server(),['Original.'])
            before=(folder/'0.wav').read_bytes()
            original=Path.write_text
            def disk_full(path, *args, **kwargs):
                if path.name.startswith('0.json'): raise OSError('disk full')
                return original(path,*args,**kwargs)
            with patch.object(Path,'write_text',disk_full), self.assertRaises(OSError):
                self.run_generation(folder,Different(),['Original.'],force=True)
            self.assertNotEqual((folder/'0.wav').read_bytes(),before)
            self.assertEqual(cached_record(folder/'0.wav')['status'],'review')
            self.assertFalse(list(folder.glob('*.json.tmp')))

    def run_generation(self, folder, server, texts, auto_fit=False, verification='fast', natural=False, manual=False, force=False,
                       verifier=None, rewrite_text='Short.', request_timeout=1, timing_mode='clip',delivery=None,automatic=False,fallback=False,assessor=None):
        function = next(n for n in ast.parse(SCRIPT.read_text(encoding='utf-8')).body
                        if isinstance(n, ast.AsyncFunctionDef) and n.name == 'uret')
        self.rewrites=[]
        async def rewrite(*args, **kwargs):
            self.rewrites.append((args,kwargs))
            return rewrite_text
        scope = dict(asyncio=asyncio, np=np, sf=sf, Path=Path, time=time, json=json,
            MODEL_ID='fixture', MODEL_REVISION='fixture', SAMPLE_RATE=48000, quality_retry=quality_retry,
            assess_chunk=assessor or (lambda *a:(0,{})), prepare_audio=lambda audio, rate:audio,
            available_window=available_window, valid_audio=valid_audio, generation_status=generation_status, spoken_text=spoken_text, finish_audio=finish_audio,
            SpeechVerifier=verifier or Verifier, rewrite_for_window=rewrite)
        exec(compile(ast.Module(body=[function],type_ignores=[]),str(SCRIPT),'exec'),scope)
        ref = folder/'reference.wav'; ref.write_bytes(b'fixture')
        args = SimpleNamespace(steps=15,eszamanli=2,batch_tokens=2048,max_model_len=2048,
            gpu_mem=.8,ready_timeout=1,reference=ref,verify_python='fixture',
            force_groups={'1'} if force else set(),regeneration_seed=123,group_seeds=[42+i for i in range(len(texts))],
            group_keys=[str(i+1) for i in range(len(texts))],bosluk_pay_ms=0,end_limit_ms=None,
            retry=1,request_timeout=request_timeout,seed=42,temperature=.8,cfg=1.65,max_generate_length=1024,
            verification=verification,auto_fit=auto_fit,report_dir=folder, natural_speech=natural,manual_groups={'1'} if manual else set(),timing_mode=timing_mode)
        paths = [folder/f'{i}.wav' for i in range(len(texts))]
        args.group_delivery=delivery or []
        args.prosody_plan='fixture' if automatic else None
        modules = {'huggingface_hub':SimpleNamespace(snapshot_download=lambda *a,**k:'fixture'),
                   'nanovllm_voxcpm':SimpleNamespace(VoxCPM=SimpleNamespace(from_pretrained=lambda *a,**k:server))}
        cues = [(i*1000,(i+1)*1000,text) for i,text in enumerate(texts)]
        with patch.dict(sys.modules,modules), contextlib.redirect_stdout(io.StringIO()):
            if fallback:
                node = next(n for n in ast.parse(SCRIPT.read_text(encoding='utf-8')).body
                            if isinstance(n, ast.FunctionDef) and n.name == 'generate_with_fallback')
                exec(compile(ast.Module(body=[node], type_ignores=[]), str(SCRIPT), 'exec'), scope)
                rate = scope['generate_with_fallback'](args, cues, paths, 'prompt', scope['uret'])
            else:
                rate = asyncio.run(scope['uret'](args,cues,paths,'prompt'))
        return rate,args,paths

    def test_493_10_more_similar_retry_must_not_lose_negation(self):
        class MeaningVerifier(Verifier):
            count = 0
            async def check(self, *args, **kwargs):
                self.count += 1
                return {'status':'review','review':True,'similarity':.7 if self.count==1 else .95,
                        'lost_negation':self.count>1,'missing_numbers':[]}
        with tempfile.TemporaryDirectory() as d:
            _,args,_=self.run_generation(Path(d),Server(),['Good.'],verification='detailed',verifier=MeaningVerifier)
            self.assertFalse(args.group_results[0]['verification']['lost_negation'])

    def test_493_11_failed_regeneration_keeps_text_of_retained_audio(self):
        with tempfile.TemporaryDirectory() as d:
            folder=Path(d)
            self.run_generation(folder,Server(),['Original.'],natural=True)
            server=Server();server.fail={'Different.'}
            _,args,paths=self.run_generation(folder,server,['Original.'],natural=True,force=True,rewrite_text='Different.')
            record=json.loads(paths[0].with_suffix('.json').read_text())
            self.assertEqual(record['text'],'Short.')
            self.assertEqual(record['status'],'review')

    def test_failure_retains_other_pieces_and_resume_generates_only_missing(self):
        with tempfile.TemporaryDirectory() as d:
            folder=Path(d); first=Server(); first.fail={'Broken.'}
            rate,args,paths=self.run_generation(folder,first,['Good.','Broken.'])
            self.assertEqual(rate,8000)
            self.assertEqual([r['status'] for r in sorted(args.group_results,key=lambda r:r['group'])],['ready','failed'])
            self.assertGreater(sf.info(paths[1]).frames,0, 'failed timeline placeholder remains playable')
            self.assertFalse(valid_audio(paths[1],sf), 'silence is not reusable speech')
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
