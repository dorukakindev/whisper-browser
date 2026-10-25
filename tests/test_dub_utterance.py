import asyncio
from pathlib import Path
import sys
import unittest

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools' / 'voxcpm2'))
from dub_utterance import utterance_blocks, synthesize_utterance


class UtteranceTests(unittest.TestCase):
    def test_short_complete_utterance_uses_exact_existing_request(self):
        text = 'Dur! Belki… henüz bilmiyoruz.'
        raw = np.ones(2000, dtype=np.float32) * .1
        seen = []
        async def generate(part, seed):
            seen.append((part, seed))
            return raw
        result, score = asyncio.run(synthesize_utterance(text, 42, 8000, generate, lambda *_: 0))
        self.assertEqual(score, 0)
        self.assertIs(result, raw)
        self.assertEqual(seen, [(text, 42)])

    def test_long_cue_keeps_all_words_and_reference_seed_without_tiny_fragments(self):
        sentences = ['Bu cümlede bütün ayrıntıları acele etmeden birlikte değerlendiriyoruz.' for _ in range(12)]
        text = ' '.join(sentences)
        blocks = utterance_blocks(text)
        self.assertGreater(len(blocks), 1)
        self.assertEqual(' '.join(blocks).split(), text.split())
        self.assertTrue(all(100 <= len(block) <= 420 for block in blocks))
        self.assertTrue(all(block.endswith('.') for block in blocks))
        seen = []
        async def generate(part, seed):
            seen.append((part, seed))
            return np.r_[np.zeros(100), np.ones(4000)*.1, np.zeros(100)].astype('float32')
        result, score = asyncio.run(synthesize_utterance(text, 99, 8000, generate, lambda *_: 0))
        self.assertEqual(score, 0)
        self.assertEqual(seen, [(block, 99) for block in blocks])
        self.assertTrue(np.isfinite(result).all())
        self.assertGreater(len(result), 4000 * len(blocks))

    def test_bad_raw_part_cannot_hide_clipping_behind_finishing(self):
        async def generate(*_):
            return np.ones(4000, dtype='float32')
        result, score = asyncio.run(synthesize_utterance('Uzun cümle. ' * 70, 42, 8000, generate, lambda *_: 1))
        self.assertGreater(len(result), 0, 'Usable speech must remain available for review.')
        self.assertEqual(score, 1, 'Finishing must not erase the raw acoustic evidence.')

    def test_retry_failure_keeps_caller_cache_untouched(self):
        # The helper has no file/cache mutation; cancellation/errors propagate
        # to the established per-group preservation/restart path.
        count = 0
        async def generate(*_):
            nonlocal count
            count += 1
            if count == 2:
                raise asyncio.CancelledError()
            return np.ones(4000, dtype='float32') * .1
        with self.assertRaises(asyncio.CancelledError):
            asyncio.run(synthesize_utterance('Uzun cümle. ' * 70, 42, 8000, generate, lambda *_: 0))
        self.assertEqual(count, 2)


if __name__ == '__main__':
    unittest.main()
