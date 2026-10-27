import io
import sys
import tempfile
import unittest
import wave
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
from media_shelf import letterboxd_archive
from wav_integrity import pcm_duration
from model_benchmark import wav_duration


class IntegrityTests(unittest.TestCase):
    def test_wav_declared_frames_must_exist(self):
        with tempfile.TemporaryDirectory() as temp:
            file = Path(temp) / 'ses.wav'
            with wave.open(str(file), 'wb') as wav:
                wav.setparams((2, 2, 16000, 0, 'NONE', 'not compressed'))
                wav.writeframes(b'\0' * 64000)
            self.assertEqual(pcm_duration(file), 1.0)
            file.write_bytes(file.read_bytes()[:-31])
            with self.assertRaisesRegex(ValueError, 'Truncated'):
                pcm_duration(file)
            with self.assertRaises(ValueError):
                wav_duration(file)

    def test_conflicting_export_ratings_are_order_independent(self):
        entries = [('ratings.csv', 'Date,Name,Year,Rating\n2026-10-20,Film,2000,4.5\n'),
                   ('diary.csv', 'Date,Name,Year,Rating,Watched Date\n2026-10-19,Film,2000,2,2026-10-18\n'),
                   ('reviews.csv', 'Name,Year,Rating,Review\nFilm,2000,1,Good acting\n')]
        results = []
        for source in (entries, list(reversed(entries))):
            data = io.BytesIO()
            with zipfile.ZipFile(data, 'w') as archive:
                for name, text in source:
                    archive.writestr(name, text)
            data.seek(0)
            result = letterboxd_archive(data)
            self.assertEqual(result['rows'][0]['rating'], 4.5)
            self.assertEqual(result['diary'][0]['rating'], 2)
            self.assertEqual(result['rows'][0]['review'], 'Good acting')
            results.append(result)
        self.assertEqual(results[0], results[1])

    def test_duplicate_export_entries_do_not_double_reviews_or_diary(self):
        data = io.BytesIO()
        with zipfile.ZipFile(data, 'w') as archive:
            for folder in ('one', 'two'):
                archive.writestr(folder + '/reviews.csv', 'Name,Year,Review\nFilm,2000,Good acting\n')
                archive.writestr(folder + '/diary.csv', 'Date,Name,Year\n2026-10-20,Film,2000\n2026-10-20,Film,2000\n')
        data.seek(0)
        result = letterboxd_archive(data)
        self.assertEqual(len(result['reviews']), 1)
        self.assertEqual(len(result['diary']), 2)
        self.assertEqual([row['rewatchIndex'] for row in result['diary']], [0, 1])


if __name__ == '__main__':
    unittest.main()
