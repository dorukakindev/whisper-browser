"""Content recovery must be bounded, preserve words and reject uncertain output."""
import asyncio
from pathlib import Path
import sys
import tempfile
import unittest
import numpy as np
sys.path.insert(0, str(Path(__file__).resolve().parents[1]/'tools/voxcpm2'))
from dub_recovery import recovery_blocks, recover_long_speech
from dub_finish import finish_audio, join_pause_frames


class Recovery(unittest.TestCase):
    def test_join_uses_punctuation_and_preserves_existing_breaths_and_pauses(self):
        sr = 8000
        voice = np.ones(sr, dtype=np.float32)*.1
        # Finishing retains60ms on each side, so a comma needs no extra silence.
        left = np.r_[voice, np.zeros(480)]
        right = np.r_[np.zeros(480), voice]
        self.assertEqual(join_pause_frames(left, right, sr, 'Bir ara,'), 0)
        self.assertEqual(join_pause_frames(left, right, sr, 'Cümle bitti.'), 800)
        breath = np.r_[voice, np.ones(100)*.003]
        untouched = breath.copy()
        self.assertGreater(join_pause_frames(breath, right, sr, 'Soru?'), 0)
        np.testing.assert_array_equal(breath, untouched)
        self.assertEqual(join_pause_frames(np.r_[voice,np.zeros(sr)], right, sr, 'Bitti.'), 0)

    def test_split_preserves_every_word_without_tiny_tail(self):
        text = 'Bir cümle bütünlüğü korunmalı. ' * 18
        parts = recovery_blocks(text)
        self.assertEqual(' '.join(parts), ' '.join(text.split()))
        self.assertTrue(all(len(p) <= 260 for p in parts))
        self.assertGreaterEqual(min(map(len, parts)), 80)

    def test_repair_requires_piece_and_whole_verification_and_cleans_temporary(self):
        text = 'Cümle doğal bir sesle ve eksiksiz okunmalıdır. ' * 9
        async def run(folder, rejected):
            calls, checks, attempts = [], [], []
            async def generate(part, seed):
                calls.append((part, seed))
                return np.ones(8000, dtype=np.float32)*.1
            async def verify(path, expected, **kwargs):
                self.assertTrue(path.is_file()); checks.append(expected)
                return {'status': 'review' if rejected else 'passed', 'similarity': .5 if rejected else 1}
            result = await recover_long_speech(text, text, 42, 8000, generate, finish_audio,
                verify, folder/'original.wav', 1, lambda: attempts.append(1))
            self.assertFalse((folder/'original-recovery.wav').exists())
            self.assertEqual(len(attempts), len(calls))
            if rejected:
                self.assertIsNone(result); self.assertEqual(len(calls), 1)
            else:
                self.assertEqual(checks[-1], text)
                self.assertEqual(len(checks), len(calls)+1)
                self.assertTrue(result[2]['verified'])
                self.assertEqual(len(set(seed for _, seed in calls)), 1)
        with tempfile.TemporaryDirectory() as temp:
            asyncio.run(run(Path(temp), False)); asyncio.run(run(Path(temp), True))


if __name__ == '__main__': unittest.main()
