"""Sayı kalite kapısı parite testi.

tests/fixtures/turkish-number-gate.json hem bu test hem de
tests/translation-number-gate.test.js tarafından okunur. Doğal Türkçe sayı
kullanımları (iki üç gün, beşi çeyrek geçe, ikimiz, birinci) ücretli yeniden
denemeye yol açan yanlış reddi tetiklememeli; değişmiş sayı yine reddedilmeli.
"""
import json
import os
import sys
import unittest
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sentence_translation import translation_blocking_issues  # noqa: E402

CORPUS = json.loads((Path(__file__).resolve().parent.parent / "tests" / "fixtures"
                     / "turkish-number-gate.json").read_text(encoding="utf-8"))


class TurkishNumberGateTest(unittest.TestCase):
    def test_natural_turkish_is_accepted(self):
        for source, translated in CORPUS["accept"]:
            with self.subTest(source=source, translated=translated):
                self.assertEqual(translation_blocking_issues(source, translated, "tr"), [])

    def test_changed_numbers_are_rejected(self):
        for source, translated in CORPUS["reject"]:
            with self.subTest(source=source, translated=translated):
                self.assertIn("number_mismatch",
                              translation_blocking_issues(source, translated, "tr"))

    def test_non_turkish_target_does_not_accept_turkish_words(self):
        self.assertIn("number_mismatch",
                      translation_blocking_issues("Give me 2 or 3 days.", "iki üç gün", "de"))


if __name__ == "__main__":
    unittest.main(verbosity=2)
