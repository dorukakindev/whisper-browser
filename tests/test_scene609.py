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
if __name__=='__main__':unittest.main()
