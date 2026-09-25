# -*- coding: utf-8 -*-
"""R126 (R124-01): _vtt_to_srt boş-satırsız cue sınırında önceki cue'yu düşürüyordu.

WEBVTT'te cue ayrımı boş satırla yapılır ama bazı kompakt VTT'ler boş satır
olmadan üst üste zaman satırları yazabilir; eski kod yeni `-->` görünce
cur'u eziyor, önceki cue sessizce kayboluyordu.
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from invidious import _vtt_to_srt


class VttToSrtBoundaryTest(unittest.TestCase):
    def test_blank_separated_normal(self):
        vtt = "WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nBir\n\n00:00:03.000 --> 00:00:04.000\nİki\n"
        srt = _vtt_to_srt(vtt)
        self.assertEqual(srt.count("-->"), 2)
        self.assertIn("00:00:01,000 --> 00:00:02,000", srt)
        self.assertIn("Bir", srt)
        self.assertIn("İki", srt)

    def test_compact_no_blank_lines_keeps_all_cues(self):
        # Kompakt VTT: boş satır olmadan ardışık cue'lar — eski kod yalnız
        # sonuncuyu tutuyordu.
        vtt = (
            "WEBVTT\n"
            "00:00:01.000 --> 00:00:02.000\nBir\n"
            "00:00:03.000 --> 00:00:04.000\nİki\n"
            "00:00:05.000 --> 00:00:06.000\nÜç\n"
        )
        srt = _vtt_to_srt(vtt)
        self.assertEqual(srt.count("-->"), 3, "boş satırsız cue'lar kayboluyor")
        for t in ("Bir", "İki", "Üç"):
            self.assertIn(t, srt)
        self.assertIn("00:00:05,000 --> 00:00:06,000", srt)

    def test_identifier_line_between_cues(self):
        vtt = (
            "WEBVTT\n\n"
            "cue-1\n00:00:01.000 --> 00:00:02.000\nBir\n\n"
            "cue-2\n00:00:03.000 --> 00:00:04.000\nİki\n"
        )
        srt = _vtt_to_srt(vtt)
        self.assertEqual(srt.count("-->"), 2)

    def test_two_line_cue_preserved(self):
        vtt = "WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nİlk satır\nİkinci satır\n"
        srt = _vtt_to_srt(vtt)
        self.assertIn("İlk satır", srt)
        self.assertIn("İkinci satır", srt)

    def test_hours_not_padded_twice(self):
        vtt = "WEBVTT\n\n01:02:03.500 --> 01:02:05.000\nGeç\n"
        srt = _vtt_to_srt(vtt)
        self.assertIn("01:02:03,500 --> 01:02:05,000", srt)


if __name__ == "__main__":
    unittest.main()
