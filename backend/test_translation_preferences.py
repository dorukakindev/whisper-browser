import unittest
from translation_preferences import validate, hint
class Decisions(unittest.TestCase):
    def test_mapping_and_pair_are_data(self):
        v={'version':1,'binding':{'key':'source','language':'en','target':'tr'},'rules':[{'kind':'term','source':'Guild','target':'Lonca'},{'kind':'address','source':'Alice','recipient':'Bob','target':'siz'}]}
        result=hint(v,'tr')
        self.assertIn('ONLY',result)
        self.assertIn('Alice',result)
        self.assertIn('untrusted',result)
        with self.assertRaises(ValueError):hint(v,'de')
    def test_invalid_values_are_rejected(self):
        with self.assertRaises(ValueError):validate({'version':1,'binding':{'target':'tr'},'rules':[{'kind':'address','source':'A','target':'siz'}]})


class PipelineDecisions(unittest.TestCase):
    def test_cache_and_real_translation_prompt_are_bound_to_frozen_decisions(self):
        import test_probe_refinement_r273 as helper
        import transcribe as T
        import types, json
        value={'version':1,'binding':{'key':'one','language':'en','target':'tr'},'rules':[{'kind':'term','source':'Guild','target':'Lonca'},{'kind':'address','source':'Alice','recipient':'Bob','target':'siz'}]}
        args=helper.Args(translation_preferences=value)
        before=T.translate_cache_key('The guild is here.',args,'tr','en')
        args.translation_preferences={**value,'rules':[{'kind':'term','source':'Guild','target':'Birlik'}]}
        self.assertNotEqual(before,T.translate_cache_key('The guild is here.',args,'tr','en'))
        args.translation_preferences=value
        def handler(kw,url,calls):
            payload=json.loads(kw['messages'][-1]['content'])
            parts={str(item['i']):'Lonca burada.' for item in payload['items']}
            sentences={str(g['ids'][0]):' '.join(parts[str(i)] for i in g['ids']) for g in payload['sentence_groups']}
            return types.SimpleNamespace(choices=[types.SimpleNamespace(message=types.SimpleNamespace(content=json.dumps({'items':parts,'sentences':sentences})))])
        calls=helper._install(handler)
        result,_=helper._run(T.llm_translate,[(0,2,'The guild is here.')],args,[],source_lang='en',status_out={})
        self.assertTrue(calls)
        prompts='\n'.join(str(m['content']) for call in calls for m in call.get('messages',[]) if m['role']=='system')
        self.assertIn('USER-APPROVED SCOPED DECISIONS',prompts)
        self.assertIn('Alice',prompts)
        self.assertIn('Lonca',prompts)
        self.assertTrue(result)

if __name__=='__main__':unittest.main()
