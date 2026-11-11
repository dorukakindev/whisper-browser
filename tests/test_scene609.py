import sys,types,unittest
sys.path.insert(0,'backend')
import transcribe as T
class SceneTests(unittest.TestCase):
 def test_context_changes_cache_without_poisoning_default(self):
  args=types.SimpleNamespace()
  before=T.translate_cache_key('Hello',args,'tr')
  args.scene_context={'summary':'One scene','terms':'A=B','characters':'A knows B'}
  first=T.translate_cache_key('Hello',args,'tr')
  self.assertNotEqual(before,first)
  args.scene_context['summary']='Different scene'
  self.assertNotEqual(first,T.translate_cache_key('Hello',args,'tr'))
  args.scene_context=None
  self.assertEqual(before,T.translate_cache_key('Hello',args,'tr'))
 def test_controlled_provider_receives_scene_context(self):
  import importlib.util,os
  spec=importlib.util.spec_from_file_location('route_fixture', 'backend/test_translation_routes.py')
  fixture=importlib.util.module_from_spec(spec);spec.loader.exec_module(fixture)
  seen=[]
  def handler(kw,url,calls):
   seen.append(kw['messages'][0]['content'])
   return fixture.reply(kw)
  fixture.install(handler)
  args=fixture.Args(scene_context={'summary':'SCENE609 unique context','terms':'room=oda','characters':'A knows B'})
  fixture.quiet(T.llm_translate,fixture.ENTRIES[:1],args,source_lang='en')
  self.assertTrue(seen)
  self.assertTrue(any('SCENE609 unique context' in value for value in seen))
 def test_work_frame_is_bounded_versioned_and_does_not_invent_relationships(self):
  import json
  entries=[(i*3,i*3+2,f'Ask Alice about Project Orion, line {i}.') for i in range(30)]
  frame=T.build_work_translation_context(entries,types.SimpleNamespace(translate_context=4),'en')
  data=json.loads(frame)
  self.assertEqual(data['scope'],{'kind':'whole-source','cue_count':30,'sampled_cues':6})
  self.assertEqual(data['source_samples'][0]['cue'],0)
  self.assertEqual(data['source_samples'][-1]['cue'],29)
  self.assertTrue(data['name_or_term_candidates'])
  self.assertLess(len(frame),4000)
  self.assertNotIn('relationships',data)
  self.assertNotIn('translations',data)
  self.assertIn('UNVERIFIED',T.WORK_TRANSLATION_CONTEXT_RULES)
  self.assertIn('Do not invent a relationship',T.WORK_TRANSLATION_CONTEXT_RULES)
  changed=list(entries);changed[1]=(3,5,'A revision outside the sampled cues.')
  other=T.build_work_translation_context(changed,types.SimpleNamespace(translate_context=4),'en')
  self.assertNotEqual(data['source_revision'],json.loads(other)['source_revision'])
  args=types.SimpleNamespace()
  self.assertNotEqual(T.translate_cache_key('Hello',args,'tr',work_context=frame),T.translate_cache_key('Hello',args,'tr',work_context=other))
 def test_work_frame_respects_context_off_and_interval_scope(self):
  import json
  entries=[(i*3,i*3+2,f'Exact source {i}') for i in range(30)]
  self.assertEqual(T.build_work_translation_context(entries,types.SimpleNamespace(translate_context=0)), '')
  frame=T.build_work_translation_context(entries,types.SimpleNamespace(translate_context=4,translate_cue_range='9:17'))
  data=json.loads(frame)
  self.assertEqual(data['scope']['kind'],'selected-interval')
  self.assertEqual([row['cue'] for row in data['source_samples']],[3,4,5])
  self.assertNotIn('Exact source 0',frame)
  self.assertNotIn('Exact source 29',frame)
 def test_parallel_batches_share_work_context_without_an_extra_provider_call(self):
  import importlib.util,json
  spec=importlib.util.spec_from_file_location('work_route_fixture','backend/test_translation_routes.py')
  fixture=importlib.util.module_from_spec(spec);spec.loader.exec_module(fixture)
  seen=[]
  def handler(kw,url,calls):
   seen.append((kw['messages'][0]['content'],json.loads(kw['messages'][-1]['content'])))
   return fixture.reply(kw)
  fixture.install(handler)
  baseline=fixture.quiet(T.llm_translate,fixture.ENTRIES,fixture.Args(translate_context=0,translate_workers=3),source_lang='en')
  baseline_calls=len(seen);seen.clear()
  result=fixture.quiet(T.llm_translate,fixture.ENTRIES,fixture.Args(translate_context=4,translate_workers=3),source_lang='en')
  self.assertEqual(result,baseline)
  self.assertEqual(len(seen),baseline_calls,'work context must not add a paid analysis/prepass call')
  self.assertGreater(len(seen),1)
  contexts=[json.dumps(payload['work_context'],sort_keys=True) for _,payload in seen]
  self.assertEqual(len(set(contexts)),1,'parallel completion order must not change the fixed context')
  self.assertTrue(all(T.WORK_TRANSLATION_CONTEXT_RULES in prompt for prompt,_ in seen))
  self.assertEqual(json.loads(contexts[0])['scope']['cue_count'],45)
 def test_review_uses_same_work_frame_and_preserves_explicit_glossary(self):
  import importlib.util,json
  spec=importlib.util.spec_from_file_location('work_review_fixture','backend/test_translation_routes.py')
  fixture=importlib.util.module_from_spec(spec);spec.loader.exec_module(fixture)
  seen=[]
  def handler(kw,url,calls):
   seen.append((kw['messages'][0]['content'],json.loads(kw['messages'][-1]['content'])))
   return fixture.reply(kw)
  fixture.install(handler)
  result=fixture.quiet(T.llm_translate,fixture.ENTRIES,fixture.Args(translate_context=4,translate_workers=2,translate_refine=True,glossary='Orion=Orion'),source_lang='en')
  self.assertEqual([e[2] for e in result],list(fixture.TR.values()))
  self.assertGreater(len(seen),3,'review calls must actually run')
  self.assertEqual(len({json.dumps(payload['work_context'],sort_keys=True) for _,payload in seen}),1)
  self.assertTrue(all(T.WORK_TRANSLATION_CONTEXT_RULES in prompt for prompt,_ in seen))
  self.assertTrue(all('Orion' in prompt for prompt,_ in seen))
if __name__=='__main__':unittest.main()
