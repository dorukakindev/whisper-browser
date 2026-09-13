"""Doğal Türkçe refine promptu ve karşılaştırmalı kabul kapısı korpusu."""

import json
import unittest
from pathlib import Path

import transcribe as T


ROOT = Path(__file__).resolve().parents[1]


class TurkishNativeRefineTests(unittest.TestCase):
    def test_rules_are_only_added_for_turkish_refine(self):
        turkish = T.build_refine_prompt("tr", 21, 42)
        english = T.build_refine_prompt("en", 21, 42)
        self.assertIn("DOGAL TURKCE - ANLAMDAN YENIDEN KUR", turkish)
        self.assertIn("cumle iskeletiyse", turkish)
        self.assertIn("sure butcesini", turkish)
        self.assertNotIn("DOGAL TURKCE - ANLAMDAN YENIDEN KUR", english)

    def test_acceptance_corpus(self):
        corpus = json.loads((ROOT / "quality" / "turkish-native-refine-corpus.json").read_text(encoding="utf-8"))
        accepted = rejected = 0
        for case in corpus["cases"]:
            with self.subTest(case=case["id"]):
                result = T.evaluate_refinement_candidate(
                    case["source"], case["current"], case["candidate"],
                    "tr", case["maxChars"])
                expected = case["expected"] == "accept"
                self.assertEqual(result["accepted"], expected, result)
                if expected:
                    accepted += 1
                else:
                    rejected += 1
                    self.assertIn(case["reason"], result["reasons"])
        self.assertGreaterEqual(accepted, 7)
        self.assertGreaterEqual(rejected, 5)

    def test_refine_protocol_changes_cache_identity(self):
        class Args:
            translate_model = "test"
            translate_base_url = "https://api.example"
            translate_register = "documentary"
            translate_profanity = "medium"
            max_cps = 21
            max_line_width = 42
            glossary = ""

        refined = Args()
        refined.translate_refine = True
        plain = Args()
        plain.translate_refine = False
        original_protocol = T.TURKISH_NATIVE_REFINE_PROTOCOL
        original_key = T.translate_cache_key("Right.", refined, "tr", "en")
        plain_key = T.translate_cache_key("Right.", plain, "tr", "en")
        try:
            T.TURKISH_NATIVE_REFINE_PROTOCOL = original_protocol + "-changed"
            changed_key = T.translate_cache_key("Right.", refined, "tr", "en")
            unchanged_plain_key = T.translate_cache_key("Right.", plain, "tr", "en")
        finally:
            T.TURKISH_NATIVE_REFINE_PROTOCOL = original_protocol
        self.assertNotEqual(original_key, changed_key)
        self.assertEqual(plain_key, unchanged_plain_key)


if __name__ == "__main__":
    unittest.main()
