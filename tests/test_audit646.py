"""Recheck new DeepSeek observations against the current product, without a model."""
import contextlib
import io
from pathlib import Path
import sys
import tempfile
from types import SimpleNamespace
import unittest

import numpy as np
import soundfile as sf

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT / 'backend'), str(ROOT / 'tools' / 'voxcpm2')]
from media_shelf import letterboxd
from dub_resume import recover_completed


class Audit646(unittest.TestCase):
    def test_short_csv_row_preserves_optional_missing_year(self):
        rows = letterboxd(b'Name,Year,Rating\nComplete,2024,4\nFilm')['rows']
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[1]['year'], '')
        self.assertIsNone(rows[1]['rating'])

    def recover(self, folder, missing=False, forced=False):
        paths = [folder / 'a.wav', folder / 'b.wav']
        sf.write(paths[0], np.ones(4000, dtype='float32') * .1, 8000)
        if not missing:
            sf.write(paths[1], np.ones(4000, dtype='float32') * .1, 8000)
        args = SimpleNamespace(group_keys=['a', 'b'], force_groups={'a'} if forced else set(), report_dir=folder)
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            result = recover_completed(args, [(0, 1, 'One.'), (1, 2, 'Two.')], paths)
        self.assertEqual(result, 8000)
        return args, output.getvalue()

    def test_fully_recovered_audio_does_not_claim_missing_speech(self):
        with tempfile.TemporaryDirectory() as tmp:
            args, output = self.recover(Path(tmp))
            self.assertNotIn('DUB_WARNING incomplete_audio', output)
            self.assertIn('[2/2]', output)
            self.assertFalse(any(r['status'] == 'failed' for r in args.group_results))

    def test_missing_audio_still_warns_and_failed_regeneration_stays_review(self):
        with tempfile.TemporaryDirectory() as tmp:
            args, output = self.recover(Path(tmp), missing=True, forced=True)
            self.assertIn('DUB_WARNING incomplete_audio', output)
            self.assertEqual(args.group_results[1]['status'], 'failed')
            self.assertTrue(args.group_results[0]['regenerationFailed'])
            self.assertEqual(args.group_results[0]['status'], 'review')


if __name__ == '__main__': unittest.main()
