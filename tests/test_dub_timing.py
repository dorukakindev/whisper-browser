import importlib.util
from pathlib import Path
import tempfile
import unittest

import numpy as np

spec = importlib.util.spec_from_file_location('dub_timing', Path(__file__).resolve().parents[1] / 'tools/voxcpm2/dub_timing.py')
D = importlib.util.module_from_spec(spec)
spec.loader.exec_module(D)


class DubTimingTests(unittest.TestCase):
    def test_continuation_groups_preserve_text_and_ids(self):
        cues = [(0, 2000, 'Bu kisa cumle'), (2050, 4000, 'burada tamamlanir.'),
                (6500, 7500, 'Yeni sahne.'), (7550, 9000, '- Baska konusmaci.')]
        plan = D.sentence_plan(cues)
        self.assertEqual(len(plan), 3)
        self.assertEqual(plan[0]['text'], 'Bu kisa cumle burada tamamlanir.')
        self.assertEqual(plan[0]['source_ids'], [1, 2])
        self.assertEqual([i for g in plan for i in g['source_ids']], [1, 2, 3, 4])
        self.assertEqual(len(D.sentence_plan(cues, mode='satir')), 4)

    def test_limits_and_nonmonotonic_input(self):
        tail = D.sentence_plan([(0, 8000, 'a'*130 + '.'), (8050, 9200, 'Kisa.')])
        self.assertEqual(len(tail), 1, 'nearby short ending must not lose sentence context')
        self.assertEqual(len(D.sentence_plan([(0, 3000, 'a'*100), (3100, 5000, 'b'*100)], max_chars=150)), 2)
        self.assertEqual(len(D.sentence_plan([(0, 3000, 'a'), (3050, 6000, 'b')], max_seconds=4)), 2)
        with self.assertRaises(ValueError):
            D.sentence_plan([(3000, 4000, 'a'), (0, 2000, 'b')])
        self.assertAlmostEqual(D.available_window([(0, 1000, 'a'), (1100, 2000, 'b')], 0), 1.1)
        self.assertAlmostEqual(D.available_window([(0, 1000, 'a')], 0, limit_ms=1400), 1.4)

    def test_speech_overrun_never_silently_clips(self):
        sr = 8000
        speech = np.sin(np.arange(sr*2) * 2*np.pi*220/sr).astype(np.float32) * .3
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaises(D.TimingOverflow) as failure:
                D.fit_to_window(speech, sr, 1, 1.15, directory, 'safe')
            self.assertGreater(failure.exception.report['overrun_seconds'], .5)
            wav, report = D.fit_to_window(speech, sr, 1, 1.15, directory, 'explicit', 'kirp')
            self.assertEqual(len(wav), sr)
            self.assertGreater(report['cut_frames'], 0)
            self.assertGreater(report['tempo'], 1)

    def test_padding_trim_is_separate_from_speech_cut(self):
        wav = np.concatenate([np.ones(8000, np.float32)*.2, np.zeros(80, np.float32)])
        with tempfile.TemporaryDirectory() as directory:
            out, report = D.fit_to_window(wav, 8000, 1, 1.15, directory, 'padding')
        self.assertEqual(len(out), 8000)
        self.assertEqual(report['cut_frames'], 0)
        self.assertEqual(report['silence_trim_frames'], 80)


if __name__ == '__main__':
    unittest.main()
