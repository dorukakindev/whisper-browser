import tempfile
import unittest
import sqlite3
from pathlib import Path

from translation_memory import TranslationMemory, fuzzy_semantically_compatible


class TranslationMemoryTests(unittest.TestCase):
    def test_150_pair_fuzzy_safety_and_efficiency_corpus(self):
        safe_typos = [
            ("government", "goverment"),
            ("package", "pakage"),
            ("tomorrow", "tomorow"),
            ("security", "securty"),
            ("passenger", "passnger"),
        ]
        safe = []
        for index in range(75):
            correct, typo = safe_typos[index % len(safe_typos)]
            source = f"The {correct} report for checkpoint {1000 + index} is ready today."
            candidate = f"The {typo} report for checkpoint {1000 + index} is ready today."
            safe.append((source, candidate))

        unsafe = []
        for index in range(15):
            suffix = f"at checkpoint {2000 + index} this afternoon."
            unsafe.extend([
                (f"We found {40 + index} sealed bags {suffix}",
                 f"We found {41 + index} sealed bags {suffix}"),
                (f"You can open the blue container {suffix}",
                 f"You can't open the blue container {suffix}"),
                (f"You should inspect the cargo {suffix}",
                 f"You could inspect the cargo {suffix}"),
                (f"He will question the passenger {suffix}",
                 f"She will question the passenger {suffix}"),
                (f"Alice signed the detailed report {suffix}",
                 f"Alicia signed the detailed report {suffix}"),
            ])

        self.assertEqual(len(safe), 75)
        self.assertEqual(len(unsafe), 75)
        for source, candidate in safe:
            self.assertTrue(fuzzy_semantically_compatible(source, candidate),
                            (source, candidate))
        for source, candidate in unsafe:
            self.assertFalse(fuzzy_semantically_compatible(source, candidate),
                             (source, candidate))

    def test_typographic_and_safe_fuzzy_variants_match(self):
        self.assertTrue(fuzzy_semantically_compatible("It’s a good day!", "It's a good day."))
        self.assertTrue(fuzzy_semantically_compatible(
            "I, uh, think this goverment policy is final.",
            "I think this government policy is final."))
        self.assertFalse(fuzzy_semantically_compatible("Let's eat, Grandma!", "Let's eat Grandma!"))
        self.assertFalse(fuzzy_semantically_compatible("You can go.", "You can't go."))
        self.assertFalse(fuzzy_semantically_compatible("You can go.", "He can go."))
        self.assertFalse(fuzzy_semantically_compatible("We need 15 bags.", "We need 16 bags."))
        self.assertFalse(fuzzy_semantically_compatible("Alice can go.", "Alicia can go."))
        self.assertFalse(fuzzy_semantically_compatible("The red suitcase is here.", "The blue suitcase is here."))

    def test_sentence_initial_contractions_are_not_proper_names(self):
        pairs = (
            ("It's fine.", "It is fine."),
            ("They're ready.", "They are ready."),
            ("What's wrong?", "What is wrong?"),
            ("We're leaving.", "We are leaving."),
            ("He's waiting.", "He is waiting."),
            ("She's here.", "She is here."),
        )
        for contracted, expanded in pairs:
            with self.subTest(contracted=contracted):
                self.assertTrue(fuzzy_semantically_compatible(contracted, expanded))
        self.assertFalse(fuzzy_semantically_compatible("John arrived.", "Mark arrived."))
        self.assertFalse(fuzzy_semantically_compatible("He is ready.", "She is ready."))

    def test_sentence_initial_case_change_does_not_weaken_real_name_anchor(self):
        self.assertTrue(fuzzy_semantically_compatible(
            "The package will arrive tomorrow morning.",
            "the package will arrive tomorrow morning."))
        self.assertTrue(fuzzy_semantically_compatible(
            "Open the gate for the convoy now.",
            "open the gate for the convoy now."))
        self.assertTrue(fuzzy_semantically_compatible(
            "Alice arrived at the station.",
            "alice arrived at the station."))
        self.assertFalse(fuzzy_semantically_compatible(
            "Alice arrived at the station.",
            "Alicia arrived at the station."))
        self.assertFalse(fuzzy_semantically_compatible(
            "Ankara will be quiet tomorrow.",
            "İzmir will be quiet tomorrow."))

    def test_context_and_scope_are_hard_boundaries(self):
        with tempfile.TemporaryDirectory() as work:
            tm = TranslationMemory(Path(work) / "tm.sqlite3")
            tm.store("It’s a good day!", "Bugün güzel bir gün!", "tr|model-a", "before|after")
            tm.store("This goverment policy is final.", "Bu hükümet politikası kesindir.",
                     "tr|model-a", "before|after")
            hit = tm.lookup("It's a good day.", "tr|model-a", "before|after")
            self.assertEqual(hit["target"], "Bugün güzel bir gün!")
            fuzzy_hit = tm.lookup("This government policy is final.", "tr|model-a", "before|after")
            self.assertEqual(fuzzy_hit["target"], "Bu hükümet politikası kesindir.")
            self.assertIsNone(tm.lookup("It's a good day.", "tr|model-b", "before|after"))
            self.assertIsNone(tm.lookup("It's a good day.", "tr|model-a", "other context"))
            tm.close()

    def test_schema_guard_and_row_budget_preserve_recent_memory(self):
        with tempfile.TemporaryDirectory() as work:
            path = Path(work) / "bounded.sqlite3"
            tm = TranslationMemory(path, max_rows=2)
            for index in range(3):
                tm.store(f"This is source sentence {index}.", f"Bu hedef cümle {index}.",
                         "scope", f"context-{index}")
            count = tm._conn.execute("SELECT count(*) FROM tm").fetchone()[0]
            sources = {row[0] for row in tm._conn.execute("SELECT source FROM tm")}
            self.assertEqual(count, 2)
            self.assertNotIn("This is source sentence 0.", sources)
            tm.close(); tm.close()

            future = Path(work) / "future.sqlite3"
            connection = sqlite3.connect(future)
            connection.execute("PRAGMA user_version=99")
            connection.commit(); connection.close()
            with self.assertRaisesRegex(RuntimeError, "Desteklenmeyen"):
                TranslationMemory(future)


if __name__ == "__main__":
    unittest.main()
