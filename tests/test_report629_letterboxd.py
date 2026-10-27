import io
import sys
import unittest
import zipfile
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
from media_shelf import letterboxd, letterboxd_archive

class LetterboxdImportTests(unittest.TestCase):
    def test_rating_date_is_not_a_claimed_watch_date(self):
        row = letterboxd(b'Date,Name,Year,Rating\n2026-10-20,Inception,2010,4.5\n', 'ratings.csv')['rows'][0]
        self.assertEqual(row['addedDate'], '2026-10-20')
        self.assertEqual(row['watchedDate'], '')
        self.assertFalse(row['watched'])
        watched = letterboxd(b'Date,Name,Year\n2026-10-20,Inception,2010\n', 'watched.csv')['rows'][0]
        self.assertTrue(watched['watched'])
    def test_zip_keeps_rewatches_and_rating_independent_of_entry_order(self):
        for order in (False, True):
            data = io.BytesIO()
            entries = [('diary.csv', 'Date,Name,Year,Watched Date\n2026-10-20,Inception,2010,2026-10-19\n2026-10-22,Inception,2010,2026-10-21\n2026-10-22,Inception,2010,2026-10-21\n'), ('ratings.csv', 'Date,Name,Year,Rating\n2026-10-23,Inception,2010,4.5\n')]
            with zipfile.ZipFile(data, 'w') as archive:
                for name, text in entries[::(-1 if order else 1)]:
                    archive.writestr(name, text)
            data.seek(0)
            parsed = letterboxd_archive(data)
            self.assertEqual(len(parsed['rows']), 1)
            self.assertEqual(parsed['rows'][0]['rating'], 4.5)
            self.assertTrue(parsed['rows'][0]['watched'])
            self.assertEqual(len(parsed['diary']), 3)
            self.assertEqual([r['rewatchIndex'] for r in parsed['diary']], [0, 0, 1])
    def test_standalone_diary_preserves_same_day_repeat_identity(self):
        rows = letterboxd(b'Date,Name,Year\n2026-10-20,Inception,2010\n2026-10-20,Inception,2010\n', 'diary.csv')['rows']
        self.assertEqual([row['rewatchIndex'] for row in rows], [0, 1])

if __name__ == '__main__':
    unittest.main()
