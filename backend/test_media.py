import tempfile
import unittest
from pathlib import Path

import media


class MediaValidationTests(unittest.TestCase):
    def test_clip_requires_output_file(self):
        # '--output-file' boşsa Path('').with_suffix() anlaşılmaz bir
        # ValueError üretiyordu; artık eksik parametre açıkça söylenir.
        with tempfile.TemporaryDirectory() as work:
            with self.assertRaisesRegex(ValueError, 'output-file'):
                media.download_clip('https://example.invalid/v', 0, 5, '')

    def test_download_rejects_malformed_audio_lang(self):
        # audio_lang yt-dlp format selector'üne doğrudan gömülür; ']','/'
        # gibi karakterler selector sözdizimini bozup tüm formatı değiştirir.
        with tempfile.TemporaryDirectory() as work:
            for bad in ('en]/best', 'tr+tr', 'en us', '../x'):
                with self.assertRaisesRegex(ValueError, 'ses dili'):
                    media.download('https://example.invalid/v', 1080, bad, work)


if __name__ == '__main__':
    unittest.main()
