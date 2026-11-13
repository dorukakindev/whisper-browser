"""Source-only translation context; synthetic provider, no network/model."""
import json
import types
import unittest
import test_probe_refinement_r273 as F
import transcribe as T
import sentence_translation as S
import speech_relations as R


class TranslationContext(unittest.TestCase):
    def run_translation(self, source, **options):
        speakers = options.pop('speakers', None)
        def answer(kw, _url, _calls):
            payload = json.loads(kw['messages'][-1]['content'])
            parts = {str(row['i']): '[TR] ' + row['t'] for row in payload['items']}
            sentences = {str(row['ids'][0]): ' '.join(parts[str(i)] for i in row['ids'])
                         for row in payload['sentence_groups']}
            return types.SimpleNamespace(choices=[types.SimpleNamespace(message=types.SimpleNamespace(
                content=json.dumps({'items': parts, 'sentences': sentences})))])
        import sys
        original = sys.modules['openai'].OpenAI
        try:
            calls = F._install(answer)
            output, _ = F._run(T.llm_translate, source, F.Args(**options), [], source_lang='en', speakers=speakers)
            self.assertEqual(len(output), len(source))
            self.assertEqual([(r[0],r[1]) for r in output],[(r[0],r[1]) for r in source])
            return [json.loads(call['messages'][-1]['content']) for call in calls]
        finally:
            sys.modules['openai'].OpenAI = original

    def test_dialogue_keeps_different_speakers_as_labelled_context(self):
        source = [(i*2, i*2+1.8, f'Line {i}.') for i in range(25)]
        speakers = {i: 'A' if i%2 == 0 else 'B' for i in range(25)}
        first, second = self.run_translation(source, speakers=speakers, translate_context=2)
        self.assertEqual(first['context_after'], [{'t':'Line 20.','sp':'A'}, {'t':'Line 21.','sp':'B'}])
        self.assertEqual(second['context_before'], [{'t':'Line 18.','sp':'A'}, {'t':'Line 19.','sp':'B'}])
        self.assertEqual([len(g['ids']) for p in (first,second) for g in p['sentence_groups']], [1]*25)

    def test_context_window_does_not_cut_a_neighbor_sentence(self):
        source = [(i, i+.8, f'Line {i}.') for i in range(19)]
        source += [(20,20.8,'This is'), (21,21.8,'one small'), (22,22.8,'sentence.')]
        first, second = self.run_translation(source, translate_context=2)
        self.assertEqual(first['context_after'], ['This is','one small','sentence.'])
        self.assertEqual(second['sentence_groups'][0]['ids'], [0,1,2])

    def test_context_budget_preserves_closest_source_and_marks_clipping(self):
        source = [(0,1,'older'),(2,3,'x'*2000),(4,5,'translated'),(6,7,'y'*2000)]
        before = S.translation_context_rows(source,[0,1],before=True,row_chars=1200,side_chars=1250)
        after = S.translation_context_rows(source,[3],before=False,row_chars=1200,side_chars=1250)
        self.assertEqual(before[-1], {'t':'x'*1200,'clipped':'start'})
        self.assertEqual(after[0], {'t':'y'*1200,'clipped':'end'})
        self.assertLessEqual(sum(len(r['t'] if isinstance(r,dict) else r) for r in before),1250)
        self.assertEqual(source[1][2], 'x'*2000)

    def test_scene_and_zero_window_boundaries_win_over_group_expansion(self):
        groups = {i:[i] for i in range(8)}
        groups.update({i:[0,1,2] for i in range(3)})
        self.assertEqual(S.complete_context_indexes(groups,{2,5},3,4,2,4),([2],[]))
        self.assertEqual(S.complete_context_indexes(groups,set(),3,4,3,4),([],[]))

    def test_clipped_context_and_speaker_are_part_of_cache_identity(self):
        args = F.Args()
        key = lambda row:T.translate_cache_key('Line.',args,'tr','en',context_before=[row])
        self.assertNotEqual(key({'t':'same','sp':'A'}),key({'t':'same','sp':'B'}))
        self.assertNotEqual(key({'t':'same'}),key({'t':'same','clipped':'start'}))

    def test_role_review_understands_source_context_objects(self):
        payload={'sentence_groups':[{'ids':[0],'source':'She gave him her key.'}],
                 'context_before':[{'t':'The key belongs to Mara.','sp':'A','clipped':'start'}]}
        row=R.batches(payload,'en')[0]['context'][0]
        self.assertEqual(row['source'],'The key belongs to Mara.')
        self.assertEqual(row['speaker'],'A')
        self.assertEqual(row['clipped'],'start')

if __name__=='__main__':unittest.main()
