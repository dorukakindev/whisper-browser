import unittest,json,tempfile,types
from pathlib import Path
from unittest.mock import patch
import test_transcribe as F
T=F.T

class SelectedTranslationRangeTests(unittest.TestCase):
    def test_selected_group_cannot_require_locked_source_language_tail(self):
        entries=[(0,2,'The gate'),(2,4,'opens tomorrow'),(4,6,'and closes at night.')]
        self.assertEqual(T.translation_sentence_groups(entries,F._TrArgs(translate_for_speech=True,translate_cue_range='0:3')),[[0,1],[2]])
        self.assertEqual(T.translation_sentence_groups(entries,F._TrArgs(translate_for_speech=True)),[[0,1,2]])

    def test_actual_translate_only_keeps_outside_text_as_context_not_target_parts(self):
        with tempfile.TemporaryDirectory() as directory:
            source=Path(directory)/'synthetic.en.srt'
            source.write_text('1\n00:00:00,000 --> 00:00:02,000\nThe gate\n\n2\n00:00:02,000 --> 00:00:04,000\nopens tomorrow\n\n3\n00:00:04,000 --> 00:00:06,000\nand closes at night.\n',encoding='utf-8-sig')
            seen=[]
            class Client:
                def __init__(self,**kw): self.chat=types.SimpleNamespace(completions=self)
                def create(self,**kw):
                    payload=json.loads(kw['messages'][-1]['content']);seen.append(payload)
                    data={'items':{'0':'Kapı','1':'yarın açılır'},'sentences':{'0':'Kapı yarın açılır'}}
                    return types.SimpleNamespace(choices=[types.SimpleNamespace(message=types.SimpleNamespace(content=json.dumps(data,ensure_ascii=False)))])
            args=F._TrArgs(input=str(source),output_dir=directory,language='en',max_lines=2,wrap_mode='sentence',formats='srt',dual_subtitle=False,dual_translation_first=False,translate_for_speech=True,translate_cue_range='0:3',translate_cache=False,merge_continuation=False)
            with F._fake_openai(Client),patch.object(T,'emit'),patch.object(T,'log'):
                T.translate_existing_subtitle(args)
            output=Path(directory)/'synthetic.tr.speech.srt'
            self.assertTrue(output.is_file(),'A valid selected translation must not remain partial')
            rows=T.parse_subtitle_entries(output.read_text(encoding='utf-8-sig'),'.srt')
            self.assertEqual([r[2] for r in rows],['Kapı','yarın açılır','and closes at night.'])
            self.assertEqual(len(seen),2,'Speech mode deliberately includes the editorial review pass')
            self.assertEqual([i['i'] for i in seen[0]['items']],[0,1])
            self.assertNotIn('locked_translation',json.dumps(seen[0]['items']))
            self.assertIn('and closes at night.',json.dumps(seen[0].get('context_after','')))

    def test_nonfinite_or_reversed_selection_fails_before_grouping(self):
        for raw in ['nan:3','0:inf','-1:3','3:2','3:3','1:2:3']:
            with self.subTest(raw=raw),self.assertRaises(RuntimeError):
                T.translation_sentence_groups([(0,2,'Hello.')],F._TrArgs(translate_cue_range=raw))

if __name__=='__main__': unittest.main()
