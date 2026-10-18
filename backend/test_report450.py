import sqlite3
from contextlib import closing
import tempfile
import unittest
from pathlib import Path
from translate_planner import AdaptivePlanner
from translation_memory import TranslationMemory, fuzzy_semantically_compatible

class Report450Tests(unittest.TestCase):
    def test_learned_ceiling_does_not_raise_configured_budget(self):
        planner = AdaptivePlanner(token_budget=10, base_chunk=20, min_chunk=1)
        planner.record('truncated', est_tokens=100)
        self.assertEqual(planner.pack_groups([[0], [1], [2]], 0, lambda _: 6), ([0], 1))
        unlimited = AdaptivePlanner(token_budget=0, min_chunk=1)
        unlimited.record('truncated', est_tokens=20)
        self.assertEqual(unlimited.pack_groups([[0], [1]], 0, lambda _: 10), ([0], 1))
        self.assertEqual(planner.pack_groups([[0]], 0, lambda _: 100), ([0], 1))

    def test_ambiguous_real_words_never_share_a_translation(self):
        self.assertFalse(fuzzy_semantically_compatible('The patients are ready.', 'The patents are ready.'))
        self.assertFalse(fuzzy_semantically_compatible('The message is different.', 'The massage is different.'))
        self.assertTrue(fuzzy_semantically_compatible('This goverment is ready.', 'This government is ready.'))

    def test_failed_store_rolls_back_and_releases_writer(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'memory.sqlite'
            memory = TranslationMemory(path, max_rows=1)
            try:
                memory.store('First original sentence.', 'First translation.', 'scope', 'context')
                memory._conn.execute("CREATE TRIGGER stop_prune BEFORE DELETE ON tm BEGIN SELECT RAISE(FAIL, 'fixture'); END;")
                memory._conn.commit()
                with self.assertRaises(sqlite3.Error):
                    memory.store('Second original sentence.', 'Second translation.', 'scope', 'context')
                self.assertFalse(memory._conn.in_transaction)
                self.assertEqual(memory._conn.execute('SELECT count(*) FROM tm').fetchone()[0], 1)
                with closing(sqlite3.connect(str(path), timeout=.1)) as writer:
                    with writer:
                        writer.execute('DROP TRIGGER stop_prune')
            finally:
                memory.close()

    def test_history_and_memory_record_sizes_are_bounded(self):
        planner = AdaptivePlanner()
        for _ in range(2000):
            planner.record('ok', 1)
        self.assertLessEqual(len(planner.stats['chunk_history']), 1000)
        self.assertLessEqual(len(planner.stats['worker_history']), 1000)
        with tempfile.TemporaryDirectory() as directory:
            memory = TranslationMemory(Path(directory) / 'memory.sqlite')
            try:
                self.assertFalse(memory.store('a' * 32001, 'translation', 'scope', 'context'))
            finally:
                memory.close()

if __name__ == '__main__':
    unittest.main()
