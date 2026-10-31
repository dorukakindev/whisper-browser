"""Run production AST orchestration using the existing controlled-engine fixtures.

No model import, GPU, network, or provider request is made. The actual file-based
rewrite protocol and in-memory candidate policy run unchanged.
"""
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
import uuid

import numpy as np
import soundfile as sf

sys.path.insert(0, str(Path(__file__).resolve().parent))
import test_dub_generation_quality as fixture
from dub_delivery import delivery_contexts, VERSION as CONTEXT_VERSION
from dub_finish import spoken_text, finish_audio
from dub_quality import speech_check, chunk_key
from dub_lifecycle import EngineStalled


def production_functions(names):
    return [node for node in ast.parse(fixture.SCRIPT.read_text(encoding='utf-8')).body
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name in names]


class RecordingServer(fixture.Server):
    def __init__(self, seconds=(1,), failure=None):
        super().__init__()
        self.conditioning=[]
        self.seconds=seconds
        self.failure=failure

    async def encode_latents(self, *_):
        return 'immutable-clean-reference'

    async def generate(self, text, **kwargs):
        self.calls.append(text)
        self.seeds.append(kwargs['seed'])
        self.conditioning.append(kwargs)
        index=len(self.calls)-1
        if index and self.failure:
            raise self.failure
        seconds=self.seconds[min(index,len(self.seconds)-1)]
        yield np.full(round(seconds*self.sample_rate), .1, dtype=np.float32)


class FullVerifier(fixture.Verifier):
    async def check(self, path, text, **_):
        result=speech_check(text,text)
        return {'status':'passed', **result}


class NaturalGenerationTests(unittest.TestCase):
    def run_generation(self, folder, server, texts, *, windows=None, natural=True,
                       auto_fit=False, verifier=FullVerifier, responses=None):
        # Match GenerationTests.run_generation's fixture contract, adding real
        # rewrite_for_window, final-plan contexts and a bounded response writer.
        scope=dict(asyncio=asyncio,np=np,sf=sf,Path=Path,time=time,json=json,uuid=uuid,
                   MODEL_ID='fixture',MODEL_REVISION='fixture',SAMPLE_RATE=48000,
                   quality_retry=fixture.quality_retry,assess_chunk=lambda *_:(0,{}),
                   prepare_audio=lambda audio,_:audio,available_window=fixture.available_window,
                   valid_audio=fixture.valid_audio,generation_status=fixture.generation_status,
                   spoken_text=spoken_text,finish_audio=finish_audio,SpeechVerifier=verifier)
        functions=production_functions({'uret','rewrite_for_window'})
        exec(compile(ast.Module(body=functions,type_ignores=[]),str(fixture.SCRIPT),'exec'),scope)
        reference=folder/'reference.wav'; reference.write_bytes(b'fixture')
        rewrite_dir=folder/'rewrite'; rewrite_dir.mkdir()
        groups=[]
        for i,text in enumerate(texts):
            start=i*10000
            groups.append({'start':start,'end':start+round((windows or [4]*len(texts))[i]*1000),
                           'text':text,'source_ids':[i+1]})
        args=SimpleNamespace(steps=15,eszamanli=1,batch_tokens=2048,max_model_len=2048,gpu_mem=.8,
            ready_timeout=1,reference=reference,verify_python='fixture',force_groups=set(),regeneration_seed=123,
            group_seeds=[42+i for i in range(len(texts))],group_keys=[str(i+1) for i in range(len(texts))],
            source_hash='bound-source-sha',bosluk_pay_ms=0,end_limit_ms=None,retry=1,request_timeout=1,
            seed=42,temperature=.8,cfg=1.65,max_generate_length=1024,verification='detailed',
            auto_fit=auto_fit,report_dir=folder,natural_speech=natural,manual_groups=set(),timing_mode='video',
            group_delivery=[None for _ in texts],prosody_plan=None,expression='reference',
            group_context=delivery_contexts(groups) if natural else [None for _ in texts],
            rewrite_dir=rewrite_dir,speech_edit_status={})
        self.requests=[]
        def capture(*values, **_):
            line=' '.join(map(str,values))
            if line.startswith('DUB_REWRITE '):
                request=json.loads(line[len('DUB_REWRITE '):]);self.requests.append(request)
                response=responses(request) if responses else {'text':request['text'],'status':'unchanged'}
                (rewrite_dir/(request['id']+'.json')).write_text(json.dumps(response),encoding='utf-8')
        scope['print']=capture
        paths=[folder/f'{i}.wav' for i in range(len(texts))]
        modules={'huggingface_hub':SimpleNamespace(snapshot_download=lambda *_a,**_k:'fixture'),
                 'nanovllm_voxcpm':SimpleNamespace(VoxCPM=SimpleNamespace(from_pretrained=lambda *_a,**_k:server))}
        cues=[(g['start'],g['end'],g['text']) for g in groups]
        self.last_args=args
        with patch.dict(sys.modules,modules),contextlib.redirect_stdout(io.StringIO()):
            asyncio.run(scope['uret'](args,cues,paths,'exact reference transcript'))
        return args,paths

    def test_final_context_reaches_engine_question_isolated_plain_retains_prompt(self):
        with tempfile.TemporaryDirectory() as folder:
            server=RecordingServer()
            args,_=self.run_generation(Path(folder),server,['Neden geldin?','Bugün buradayız.'])
            self.assertTrue(server.calls[0].startswith('(Speaking '))
            self.assertTrue(server.calls[0].endswith('Neden geldin?'))
            self.assertIsNone(server.conditioning[0]['prompt_id'])
            self.assertEqual(server.calls[1],'Bugün buradayız.')
            self.assertEqual(server.conditioning[1]['prompt_id'],'prompt')
            self.assertTrue(all(c['ref_audio_latents']=='immutable-clean-reference' for c in server.conditioning))
            self.assertEqual([r['referenceMode'] for r in args.group_results],['isolated','continuation'])
            self.assertEqual([r['sourceHash'] for r in self.requests],['bound-source-sha']*2)
            self.assertEqual([r['key'] for r in self.requests],['1','2'])
            self.assertFalse(list((Path(folder)/'rewrite').glob('*.json')))

    def test_real_rewrite_file_exchange_preserves_source_binding_and_review_status(self):
        with tempfile.TemporaryDirectory() as folder:
            server=RecordingServer()
            args,paths=self.run_generation(Path(folder),server,['Bugün burada bulunuyoruz.'],
                responses=lambda request:{'text':'Bugün buradayız.','status':'source_reviewed'})
            self.assertEqual(server.calls,['Bugün buradayız.'])
            self.assertEqual(args.speech_edit_status,{0:{'natural':'source_reviewed'}})
            self.assertEqual(self.requests[0]['text'],'Bugün burada bulunuyoruz.')
            self.assertEqual(self.requests[0]['key'],'1')
            self.assertEqual(self.requests[0]['sourceHash'],'bound-source-sha')
            record=json.loads(paths[0].with_suffix('.json').read_text(encoding='utf-8'))
            self.assertEqual(record['speechEditing']['natural'],'source_reviewed')
            self.assertTrue(record['naturalEdited'])

    def test_changed_unreviewed_worker_response_cannot_replace_spoken_text(self):
        for status in ('source_unavailable','editor_failed',None):
            with self.subTest(status=status), tempfile.TemporaryDirectory() as folder:
                server=RecordingServer()
                self.run_generation(Path(folder),server,['Bugün burada bulunuyoruz.'],
                    responses=lambda request:{'text':'Bugün buradayız.','status':status})
                self.assertEqual(server.calls,['Bugün burada bulunuyoruz.'])

    def test_accepted_punctuation_edit_refreshes_conditioning_role(self):
        with tempfile.TemporaryDirectory() as folder:
            server=RecordingServer()
            self.run_generation(Path(folder),server,['Bugün burada bulunuyoruz'],
                responses=lambda request:{'text':'Bugün burada bulunuyoruz?','status':'source_reviewed'})
            self.assertIn('natural question intonation',server.calls[0])
            self.assertIsNone(server.conditioning[0]['prompt_id'])

    def test_rhythm_alternate_only_on_risk_once_and_full_asr_accepts_measured_improvement(self):
        with tempfile.TemporaryDirectory() as folder:
            server=RecordingServer((2,1.5))
            args,paths=self.run_generation(Path(folder),server,['Bugün buradayız.'],windows=[1])
            self.assertEqual(len(server.calls),2)
            self.assertEqual(server.seeds,[42,400051])
            self.assertEqual(server.conditioning[0]['prompt_id'],'prompt')
            self.assertIsNone(server.conditioning[1]['prompt_id'])
            self.assertEqual(args.group_results[0]['rhythmCandidate'],{'accepted':True,'reason':'less-window-overflow'})
            self.assertEqual(sf.info(paths[0]).frames,12000)
            self.assertEqual(args.group_results[0]['verification']['status'],'passed')
        with tempfile.TemporaryDirectory() as folder:
            server=RecordingServer()
            args,_=self.run_generation(Path(folder),server,['Bugün buradayız.'])
            self.assertEqual(len(server.calls),1)
            self.assertEqual(args.group_results[0]['rhythmRisks'],[])

    def test_optional_rhythm_failure_and_missing_content_retain_first_wave(self):
        class MissingCandidate(FullVerifier):
            async def check(self,path,text,**kwargs):
                actual='' if '-rhythm' in str(path) else text
                result=speech_check(text,actual)
                return {'status':'review' if result['review'] else 'passed',**result}
        cases=[(ValueError('optional failure'),FullVerifier),(None,MissingCandidate)]
        for failure,verifier in cases:
            with self.subTest(failure=type(failure).__name__),tempfile.TemporaryDirectory() as folder:
                server=RecordingServer((2,1.5),failure)
                args,paths=self.run_generation(Path(folder),server,['Bugün buradayız.'],windows=[1],verifier=verifier)
                self.assertEqual(len(server.calls),2)
                self.assertFalse(args.group_results[0]['rhythmCandidate']['accepted'])
                expected,_=finish_audio(np.full(16000,.1,dtype=np.float32),8000)
                np.testing.assert_allclose(sf.read(paths[0])[0],expected,atol=1/32768)
                self.assertFalse(list(Path(folder).glob('*rhythm.wav')))

    def test_rhythm_stall_and_oom_propagate_while_first_wave_is_retained_for_review(self):
        for failure in (EngineStalled('controlled stall'),RuntimeError('CUDA out of memory')):
            with self.subTest(failure=type(failure).__name__),tempfile.TemporaryDirectory() as folder:
                server=RecordingServer((2,),failure)
                with self.assertRaises(type(failure)):
                    self.run_generation(Path(folder),server,['Bugün buradayız.'],windows=[1])
                self.assertTrue(server.stopped)
                self.assertEqual(sf.info(Path(folder)/'0.wav').frames,16000)
                record=json.loads((Path(folder)/'0.json').read_text(encoding='utf-8'))
                self.assertEqual(record['status'],'review')
                self.assertIn('1',self.last_args.force_groups)

    def test_video_duration_fit_rejects_missing_words_and_adopts_verified_reviewed_text(self):
        class MissingFit(FullVerifier):
            async def check(self,path,text,**kwargs):
                result=speech_check(text,'' if '-fit' in str(path) else text)
                return {'status':'review' if result['review'] else 'passed',**result}
        original='Bugün bu uzun cümlenin bütün ayrıntılarını birlikte değerlendirdik.'
        for verifier,accepted in ((MissingFit,False),(FullVerifier,True)):
            with self.subTest(accepted=accepted),tempfile.TemporaryDirectory() as folder:
                server=RecordingServer((2,.5))
                args,paths=self.run_generation(Path(folder),server,[original],natural=False,windows=[1],
                    auto_fit=True,verifier=verifier,
                    responses=lambda request:{'text':'Bugün değerlendirdik.','status':'source_reviewed'})
                self.assertEqual(len(server.calls),2)
                self.assertEqual(self.requests[0]['mode'],'fit')
                record=json.loads(paths[0].with_suffix('.json').read_text(encoding='utf-8'))
                self.assertEqual(record['rewritten'],accepted)
                self.assertEqual(record['text'],'Bugün değerlendirdik.' if accepted else original)
                self.assertEqual(sf.info(paths[0]).frames,4000 if accepted else 16000)
                self.assertEqual(record['speechEditing']['fit'],'source_reviewed')

    def test_actual_group_cache_identity_changes_with_neighbour_context(self):
        tree=ast.parse(fixture.SCRIPT.read_text(encoding='utf-8'))
        node=next(n for n in ast.walk(tree) if isinstance(n,ast.FunctionDef) and n.name=='group_settings')
        groups=[{'source_ids':[1],'start':0,'end':1000,'text':'Buna rağmen,'},
                {'source_ids':[2],'start':1100,'end':2100,'text':'devam ediyoruz.'}]
        args=SimpleNamespace(group_delivery=[None,None],natural_speech=True,prosody_plan=None,
                             group_context=delivery_contexts(groups),pronunciations=[])
        scope=dict(args=args,settings=('fixture',),bounded_groups=[False,False],
                   cues=[(g['start'],g['end'],g['text']) for g in groups],CONTEXT_VERSION=CONTEXT_VERSION)
        exec(compile(ast.Module(body=[node],type_ignores=[]),str(fixture.SCRIPT),'exec'),scope)
        first=chunk_key(scope['group_settings'](1),groups[1]['text'],42)
        args.group_context=delivery_contexts([{**groups[0],'text':'Buna rağmen.'},groups[1]])
        second=chunk_key(scope['group_settings'](1),groups[1]['text'],42)
        self.assertNotEqual(first,second)

    def test_duration_fit_engine_failure_and_cancel_keep_complete_original_take(self):
        original='Bugün bu uzun cümlenin bütün ayrıntılarını birlikte değerlendirdik.'
        for failure in (EngineStalled('controlled fit stall'),
                        RuntimeError('CUDA out of memory'), asyncio.CancelledError()):
            with self.subTest(failure=type(failure).__name__), tempfile.TemporaryDirectory() as folder:
                folder=Path(folder)
                server=RecordingServer((2,),failure)
                with self.assertRaises(type(failure)):
                    self.run_generation(folder,server,[original],natural=False,windows=[1],auto_fit=True,
                        responses=lambda request:{'text':'Bugün değerlendirdik.','status':'source_reviewed'})
                self.assertEqual(len(server.calls),2)
                self.assertTrue(server.stopped)
                self.assertTrue(fixture.valid_audio(folder/'0.wav',sf))
                expected,_=finish_audio(np.full(16000,.1,dtype=np.float32),8000)
                np.testing.assert_allclose(sf.read(folder/'0.wav')[0],expected,atol=1/32768)
                record=json.loads((folder/'0.json').read_text(encoding='utf-8'))
                self.assertEqual(record['text'],original)
                self.assertFalse(record['rewritten'])
                self.assertEqual(record['status'],'review')
                self.assertNotEqual(record['verification']['status'],'passed')
                self.assertEqual(record['recoveryReason'],'duration_fit_interrupted')
                self.assertIn('1',self.last_args.force_groups)
                self.assertFalse(list(folder.glob('*.tmp.wav')))


if __name__=='__main__':unittest.main()
