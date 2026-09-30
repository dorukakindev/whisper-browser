# -*- coding: utf-8 -*-
"""R323-2 — zaman ekseni oracle fuzz'ı (backend).

Kapsam:
- offset_diarization_spans: kırpılmış eksenden kaynak eksene span taşıma
- compute_media_duration: bilinen süre ile klip penceresi kelepçesi
Her ikisi de deterministik tohumlu property kontrolleriyle kilitlenir.
"""
import random
import sys
import unittest

sys.path.insert(0, 'backend')
import transcribe


class TestOffsetDiarizationSpans(unittest.TestCase):
    def test_roundtrip_identity(self):
        rnd = random.Random(20260930)
        for _ in range(300):
            spans = []
            for i in range(rnd.randrange(0, 12)):
                s = rnd.uniform(0, 600)
                spans.append((s, s + rnd.uniform(0.1, 5), f"S{i}"))
            offset = rnd.uniform(-120, 120)
            fwd = transcribe.offset_diarization_spans(spans, offset)
            back = transcribe.offset_diarization_spans(fwd, -offset)
            self.assertEqual(len(back), len(spans))
            for (s0, e0, sp0), (s1, e1, sp1) in zip(spans, back):
                self.assertAlmostEqual(s0, s1, places=9)
                self.assertAlmostEqual(e0, e1, places=9)
                self.assertEqual(sp0, sp1)

    def test_zero_and_none_return_copy_not_alias(self):
        spans = [(1.0, 2.0, "S0")]
        for offset in (0, 0.0, None):
            out = transcribe.offset_diarization_spans(spans, offset)
            self.assertIsNot(out, spans)
            self.assertEqual(out, spans)
        # Liste boşsa da aynı davranış.
        self.assertEqual(transcribe.offset_diarization_spans([], 5.0), [])
        self.assertEqual(transcribe.offset_diarization_spans(None, 5.0), [])

    def test_ints_become_floats_and_speaker_preserved(self):
        out = transcribe.offset_diarization_spans([(1, 2, "A")], 2)
        self.assertEqual(out, [(3.0, 4.0, "A")])


class TestComputeMediaDuration(unittest.TestCase):
    def test_fuzz_invariants(self):
        rnd = random.Random(99)
        for _ in range(1000):
            duration = rnd.choice([0.0, rnd.uniform(0, 1000)])
            clip_start = rnd.choice([None, rnd.uniform(-50, 500)])
            clip_end = rnd.choice([None, rnd.uniform(-10, 1000)])
            out = transcribe.compute_media_duration(duration, clip_start, clip_end)
            # Asla negatif değil.
            self.assertGreaterEqual(out, 0.0)
            # Klip sonu yoksa işlenen süre = bilinen süre.
            if clip_end is None:
                self.assertEqual(out, max(0.0, duration))
                continue
            window = max(0.0, float(clip_end) - float(clip_start or 0.0))
            if duration > 0:
                # Klip penceresi süreyi şişirmez.
                self.assertEqual(out, min(duration, window))
                self.assertLessEqual(out, duration)
            else:
                # Süre bilinmiyorsa pencere tek tahmin.
                self.assertEqual(out, window)

    def test_clip_end_before_start_gives_zero(self):
        self.assertEqual(transcribe.compute_media_duration(100.0, 50.0, 10.0), 0.0)


if __name__ == "__main__":
    unittest.main(verbosity=2)
