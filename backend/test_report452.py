import math
from pathlib import Path
import tempfile
import types
import unittest
from unittest.mock import patch

import transcribe
from translation_auth import translation_api_key


class OutputRegressionTests(unittest.TestCase):
    def test_keyless_translation_is_loopback_only(self):
        for endpoint in ['http://localhost:1234/v1', 'http://127.0.0.1/v1', 'http://[::1]:1234/v1']:
            self.assertEqual(translation_api_key('', endpoint), 'local-no-auth')
        for endpoint in ['https://provider.test/v1', 'http://localhost.attacker.test',
                         'http://localhost@provider.test', 'file://localhost/v1', 'http://[invalid']:
            self.assertEqual(translation_api_key('', endpoint), '')
        self.assertEqual(translation_api_key(' fixture-key ', 'https://provider.test'), 'fixture-key')

    def test_invalid_times_never_replace_existing_subtitles(self):
        for writer, extension in [(transcribe.write_srt, 'srt'), (transcribe.write_vtt, 'vtt')]:
            with tempfile.TemporaryDirectory() as directory:
                target = Path(directory) / f'Türkçe.{extension}'
                for start, end in [(-2, -1), (-1, 1), (2, 1), (1, 1),
                                   (1, 1.0001), (math.nan, 2), (0, math.inf)]:
                    target.write_text('existing subtitle', encoding='utf-8')
                    with self.assertRaises(ValueError, msg=(extension, start, end)):
                        writer([(0, 1, 'valid'), (start, end, 'invalid')], target)
                    self.assertEqual(target.read_text(encoding='utf-8'), 'existing subtitle')
                    self.assertEqual(list(Path(directory).iterdir()), [target])

    def test_long_recordings_and_utf8_still_export(self):
        with tempfile.TemporaryDirectory() as directory:
            for writer, extension in [(transcribe.write_srt, 'srt'), (transcribe.write_vtt, 'vtt')]:
                target = Path(directory) / f'çıktı.{extension}'
                writer([(25 * 3600, 25 * 3600 + 1, 'Türkçe ışık')], target)
                content = target.read_text(encoding='utf-8-sig')
                self.assertIn('25:00:00', content)
                self.assertIn('Türkçe ışık', content)

    def test_nullable_download_progress_does_not_abort_download(self):
        events = []
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / 'fixture.wav'
            target.write_bytes(b'fixture')

            class Downloader:
                def __init__(self, options):
                    self.hook = options['progress_hooks'][0]

                def __enter__(self):
                    return self

                def __exit__(self, *args):
                    pass

                def extract_info(self, url, download):
                    for downloaded, total in [(None, 100), (50, None), (150, 100), (-1, 100)]:
                        self.hook({'status': 'downloading', 'downloaded_bytes': downloaded,
                                   'total_bytes': total})
                    self.hook({'status': 'finished', 'filename': str(target)})
                    return {'id': 'fixture', 'title': 'fixture'}

            with patch.dict('sys.modules', {'yt_dlp': types.SimpleNamespace(YoutubeDL=Downloader)}), \
                    patch.object(transcribe, 'emit', side_effect=lambda kind, **data: events.append((kind, data))), \
                    patch.object(transcribe, 'log'):
                result = transcribe.download_youtube('https://example.test/fixture', directory)
            self.assertEqual(result[0], str(target))
            self.assertEqual([data['percent'] for kind, data in events if kind == 'download_progress'],
                             [0, 0, 100, 0, 100])


if __name__ == '__main__':
    unittest.main()
