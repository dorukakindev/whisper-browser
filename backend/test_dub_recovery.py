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
    def test_530_tiny_or_excessive_repairs_never_start_the_engine(self):
        async def generate(*args):
            raise AssertionError('unbounded or word-sized repair must not synthesize')
        async def verify(*args, **kwargs):
            raise AssertionError('skipped repair must not verify')
        texts = ['Kısa cümle.', 'uzunsözcük' * 22, 'sözcük ' * 1600]
        with tempfile.TemporaryDirectory() as folder:
            for text in texts:
                result = asyncio.run(recover_long_speech(text, text, 42, 8000,
                    generate, finish_audio, verify, Path(folder)/'original.wav', 1))
                self.assertIsNone(result)

    def test_530_contradictory_review_never_approves_repaired_audio(self):
        text = 'Cümle doğal bir sesle ve eksiksiz okunmalıdır. ' * 9
        async def generate(*args):
            return np.ones(8000, dtype=np.float32)*.1
        async def verify(*args, **kwargs):
            return {'status': 'passed', 'review': True}
        with tempfile.TemporaryDirectory() as folder:
            result = asyncio.run(recover_long_speech(text, text, 42, 8000,
                generate, finish_audio, verify, Path(folder)/'original.wav', 1))
            self.assertIsNone(result)
            self.assertFalse(list(Path(folder).glob('*recovery.wav')))

    def test_recovery_prefers_sentence_end_to_nearer_comma(self):
        first = 'Anlatının ilk düşüncesi burada tamamlanıyor. '
        text = first + 'devam eden düşünce, ' + 'sözcük '*18
        parts = recovery_blocks(text, 150)
        self.assertEqual(parts[0], first.strip())
        self.assertEqual(' '.join(parts), ' '.join(text.split()))

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

    def test_recovery_checks_raw_acoustics_before_finishing_or_asr(self):
        text = 'Cümle doğal bir sesle ve eksiksiz okunmalıdır. ' * 9
        async def run(folder, score):
            checked, finished, verified = [], [], []
            async def generate(part, seed):
                return np.ones(8000, dtype=np.float32)
            def assess(raw, rate, part):
                self.assertEqual(float(raw.max()), 1.)
                self.assertEqual(rate, 8000)
                checked.append(part)
                return score
            def finish(raw, rate):
                finished.append(1)
                return finish_audio(raw, rate)
            async def verify(*args, **kwargs):
                verified.append(1)
                return {'status': 'passed'}
            result = await recover_long_speech(text, text, 42, 8000, generate, finish,
                verify, folder/'original.wav', 1, assess=assess)
            self.assertTrue(checked)
            if score > 0:
                self.assertIsNone(result)
                self.assertFalse(finished)
                self.assertFalse(verified)
            else:
                self.assertIsNotNone(result)
                self.assertEqual(len(finished), len(checked))
            self.assertFalse((folder/'original-recovery.wav').exists())
        with tempfile.TemporaryDirectory() as temp:
            for score in (3., float('inf'), 0.):
                asyncio.run(run(Path(temp), score))

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
