"""Independent parse -> provider -> cache -> export invariants using controlled replies."""
import json
from pathlib import Path
import sys
import tempfile
import types
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent))
from test_independent_asr_recovery import arguments
import transcribe as T
import pipeline_control as control
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools' / 'voxcpm2'))
from dub_plan import parse_srt, make_groups, plan, apply_edits, MAX_SOURCE_BYTES
from dub_quality import chunk_key
from dub_take_cache import snapshot, digest


class IndependentTranslationTests(unittest.TestCase):
    def test_changed_source_and_corrupt_cache_never_reuse_wrong_quantity(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder); args = arguments(root)
            args.translate_to='tr'; args.language='en'; args.translate_api_key='fixture'
            args.translate_base_url='https://fixture.invalid/v1'; args.translate_model='fixture-model'
            args.translate_refine=False; args.translate_cache=True; args.translate_workers=1
            answers={'We delivered 45 red parcels.':'45 kırmızı paket teslim ettik.',
                     'We delivered 46 green parcels.':'46 yeşil paket teslim ettik.'}
            calls=[]
            class Client:
                def __init__(self, **kwargs): self.chat=types.SimpleNamespace(completions=self)
                def create(self, **kwargs):
                    payload=json.loads(kwargs['messages'][-1]['content']); calls.append(payload)
                    result={str(row['i']):answers[row['t']] for row in payload['items']}
                    return types.SimpleNamespace(choices=[types.SimpleNamespace(finish_reason='stop',message=types.SimpleNamespace(content=json.dumps(result,ensure_ascii=False)))])
            fake=types.ModuleType('openai');fake.OpenAI=Client
            with patch.dict(sys.modules,{'openai':fake}),patch.object(T,'log'),patch.object(T,'emit'):
                source=[(0,3,'We delivered 45 red parcels.')]
                first=T.llm_translate(source,args,[],source_lang='en')
                self.assertEqual(first[0][2],answers[source[0][2]])
                first_calls=len(calls)
                self.assertEqual(T.llm_translate(source,args,[],source_lang='en'),first)
                self.assertEqual(len(calls),first_calls)
                changed=[(0,3,'We delivered 46 green parcels.')]
                result=T.llm_translate(changed,args,[],source_lang='en')
                self.assertEqual(result[0][2],answers[changed[0][2]]);self.assertGreater(len(calls),first_calls)
                cache_path=Path(T.translate_cache_path(args)); cache=json.loads(cache_path.read_text(encoding='utf-8'))
                for key in cache: cache[key]={'text':'700 mor paket teslim ettik.','parts':['700 mor paket teslim ettik.']}
                cache_path.write_text(json.dumps(cache),encoding='utf-8')
                self.assertEqual(T.llm_translate(changed,args,[],source_lang='en')[0][2],answers[changed[0][2]])
                # Either a checked translation-memory hit or a fresh provider result is safe.
                output=root/'translated.srt';T.write_srt(result,output,42,2,language='tr')
                saved=parse_srt(output)
                self.assertEqual(saved[0],(0,3000,answers[changed[0][2]]))
                self.assertEqual(source[0][2],'We delivered 45 red parcels.')

    def test_cancelled_late_provider_result_is_not_cached_as_completed(self):
        with tempfile.TemporaryDirectory() as folder:
            args=arguments(Path(folder));args.translate_to='tr';args.language='en';args.translate_api_key='fixture'
            args.translate_base_url='https://fixture.invalid/v1';args.translate_model='fixture-model'
            args.translate_refine=False;args.translate_cache=True;args.translate_workers=1
            cancelled=[False]
            class Client:
                def __init__(self,**kwargs):self.chat=types.SimpleNamespace(completions=self)
                def create(self,**kwargs):
                    cancelled[0]=True
                    return types.SimpleNamespace(choices=[types.SimpleNamespace(finish_reason='stop',message=types.SimpleNamespace(content='{"0":"45 kırmızı paket teslim ettik."}'))])
            def checkpoint(stage,point):
                if cancelled[0]:raise control.PipelineCancelled(stage,point)
            fake=types.ModuleType('openai');fake.OpenAI=Client
            with patch.dict(sys.modules,{'openai':fake}),patch.object(T,'log'),patch.object(T,'emit'),patch.object(T,'cancellation_checkpoint',side_effect=checkpoint):
                with self.assertRaises(control.PipelineCancelled):T.llm_translate([(0,3,'We delivered 45 red parcels.')],args,[],source_lang='en')
            cache=T.load_translate_cache(T.translate_cache_path(args))
            self.assertEqual(cache,{})

    def test_parse_plan_limits_source_change_and_immutable_take(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);source=root/'source.srt'
            source.write_text('1\n00:00:00,000 --> 00:00:00,000\n[MÜZİK]\n\n2\n00:00:01,000 --> 00:00:02,000\nMerhaba dünya.\n',encoding='utf-8')
            current=plan(source)
            self.assertEqual(current['groups'][0]['source_ids'],[2]);self.assertEqual(current['skipped'],1)
            source.write_text(source.read_text(encoding='utf-8').replace('dünya','evren'),encoding='utf-8')
            updated=plan(source);self.assertNotEqual(current['sourceHash'],updated['sourceHash'])
            with self.assertRaisesRegex(ValueError,'degisti'):apply_edits(updated['groups'],{'sourceHash':current['sourceHash'],'edits':{'2':'Old edit.'}},updated['sourceHash'])
            self.assertEqual(parse_srt(source,source_bytes=b''),[])
            with self.assertRaises(ValueError):parse_srt(source,source_bytes=b'x'*(MAX_SOURCE_BYTES+1))
            with self.assertRaisesRegex(ValueError,'grup'):make_groups([(i*2000,i*2000+1000,'Bir cümle.') for i in range(5001)],mode='satir')
            self.assertNotEqual(chunk_key(('voice-a',),'Merhaba.',1),chunk_key(('voice-b',),'Merhaba.',1))
            live=root/'cache.wav';live.write_bytes(b'independent audio bytes')
            take=snapshot(live,root/'takes');live.write_bytes(b'new cache version')
            self.assertEqual(digest(take['file']),take['sha256'])
            self.assertNotEqual(digest(live),take['sha256'])


if __name__=='__main__':unittest.main()
