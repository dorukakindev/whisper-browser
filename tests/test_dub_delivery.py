"""Model-free scene conditioning and source-map integration regressions."""
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools/voxcpm2'))
from dub_delivery import delivery_contexts, synthesis_instruction, phrase_role
from dub_plan import plan
from dub_prosody import load_plan, delivery_rows
import prepare_prosody as prepare


class DeliveryTests(unittest.TestCase):
    def group(self, text, start=0, end=1000, **extra):
        return dict(text=text, start=start, end=end, source_ids=[1], **extra)

    def test_only_explicit_phrase_roles_no_lexical_emotion_invention(self):
        for text, role in [('Neden?', 'question'), ('Dur!', 'emphatic'),
                           ('Neden? Dur!', 'mixed'), ('Bu çok korkunç.', 'statement'),
                           ('Buna rağmen,', 'continuation'), ('Peki…', 'continuation')]:
            self.assertEqual(phrase_role(text), role)
        hint = synthesis_instruction(None, delivery_contexts([self.group('Bu çok korkunç.')])[0])
        self.assertNotIn('fear', hint)
        self.assertNotIn('korkunç', hint)
        self.assertNotIn('emotion', hint)
        self.assertEqual(hint, '')
        self.assertEqual(synthesis_instruction(None, delivery_contexts([self.group('Neden? Dur!')])[0]), '')

    def test_fragment_continuity_and_resets_use_source_not_packed_times(self):
        groups = [self.group('Buna rağmen,', source_start=10000, source_end=11000),
                  self.group('devam ediyoruz.', 1000, 2000, source_start=11200, source_end=12200),
                  self.group('Neden?', 2000, 3000, source_start=30000, source_end=31000),
                  self.group('- Bilmiyorum.', 3000, 4000, source_start=31000, source_end=32000)]
        contexts = delivery_contexts(groups)
        self.assertTrue(contexts[0]['continuesNext'])
        self.assertTrue(contexts[1]['joinsPrevious'])
        self.assertEqual([c['scene'] for c in contexts], [0, 0, 1, 2])
        self.assertIn('connected phrasing', synthesis_instruction(None, contexts[1]))
        self.assertIn('question intonation', synthesis_instruction(None, contexts[2]))
        self.assertFalse(contexts[2]['continuesNext'])
        changed = delivery_contexts([{**groups[0], 'text': 'Buna rağmen.'}, *groups[1:]])
        self.assertNotEqual(changed[1], contexts[1])  # neighbouring edit invalidates identity

    def test_style_prefix_is_fixed_and_unsupported_inputs_rejected(self):
        delivery = {'energy': 'low', 'variation': 'normal', 'pauses': 'normal'}
        context = delivery_contexts([self.group('Merhaba!')])[0]
        hint = synthesis_instruction(delivery, context)
        self.assertTrue(hint.startswith('(Speaking '))
        self.assertTrue(hint.endswith(') '))
        self.assertIn('restrained energy', hint)
        self.assertIn('without shouting', hint)
        self.assertNotIn('Merhaba', hint)
        steady = synthesis_instruction({**delivery, 'variation': 'steady'}, context)
        self.assertNotIn('steady intonation', steady)
        self.assertEqual(synthesis_instruction(), '')
        with self.assertRaises(ValueError): synthesis_instruction(None, {**context, 'role': '(angry)'})

    def test_scene_baseline_and_explicit_emphasis_survive_smoothing(self):
        def row(i, level, text='Normal.'):
            return {**self.group(text, i*1200, i*1200+1000), 'features':
                    {'level':level, 'variation':.3, 'pauses':.1, 'confidence':.8}}
        first = [row(0,-30), row(1,-17,'Dur!'), row(2,-30)]
        second = [row(i,-10) for i in (10,11,12)]
        out = delivery_rows(first+second)
        self.assertEqual(out[1]['delivery']['energy'], 'high')
        self.assertTrue(all(r['delivery']['energy']=='normal' for r in out[3:]))
        invalid = row(3,-30); invalid['features']['variation']=float('nan')
        self.assertIsNone(delivery_rows(first+[invalid])[-1]['delivery'])

    def test_all_groupings_prepare_load_and_condition_without_gpu(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder); source=root/'source.wav'; source.write_bytes(b'fixture')
            srt=root/'tr.srt'
            srt.write_text('1\n00:00:01,000 --> 00:00:02,000\nBuna rağmen,\n\n'
                           '2\n00:00:02,100 --> 00:00:03,000\ndevam ediyoruz.\n\n'
                           '3\n00:00:03,100 --> 00:00:04,000\nPeki şimdi?\n', encoding='utf-8')
            for grouping in ('cumle','satir','akici','anlatim'):
                with self.subTest(grouping=grouping):
                    output=root/(grouping+'.json')
                    argv=['prepare','--source',str(source),'--srt',str(srt),'--output',str(output),
                          '--ffmpeg','ffmpeg','--grouping',grouping]
                    # Silence must remain unknown, while punctuation still provides
                    # an explicit role; no source emotion is fabricated.
                    result=type('Result',(),{'returncode':0,'stdout':np.zeros(24000,dtype='<f4').tobytes()})()
                    with patch.object(sys,'argv',argv), patch.object(prepare.subprocess,'run',return_value=result):
                        prepare.main()
                    document=plan(srt,grouping=grouping)
                    groups=document['groups']
                    values=load_plan(output,document['sourceHash'],groups)
                    self.assertTrue(all(v is None for v in values))
                    self.assertEqual(len(values), len(groups))
                    contexts=delivery_contexts(groups)
                    conditioned=[synthesis_instruction(d,c)+g['text'] for d,c,g in zip(values,contexts,groups)]
                    self.assertTrue(all(t == g['text'] or t.startswith('(Speaking ') for t,g in zip(conditioned,groups)))
                    self.assertTrue(all(t.endswith(g['text']) for t,g in zip(conditioned,groups)))


if __name__ == '__main__': unittest.main()
