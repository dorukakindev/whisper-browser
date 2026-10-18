import sys
import unittest
import tempfile
import types
import io
from contextlib import redirect_stdout
from unittest.mock import patch
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
import transcribe as T
from sentence_translation import part_anchor_issue, translation_meaning_issues


class Report466Tests(unittest.TestCase):
    def test_same_language_translate_only_produces_complete_output_without_provider(self):
        from test_transcribe import _TrArgs
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / 'film.en.srt'
            source.write_text('1\n00:00:00,000 --> 00:00:02,000\nHello there.\n\n', encoding='utf-8-sig')
            for language, target, body in [('en', 'en', 'Hello there.'),
                                           ('auto', 'tr', 'Merhaba nasılsın?')]:
                source.write_text(f'1\n00:00:00,000 --> 00:00:02,000\n{body}\n\n', encoding='utf-8-sig')
                args = _TrArgs(input=str(source), output_dir=str(root), language=language,
                               translate_to=target, max_lines=2, wrap_mode='sentence', formats='srt',
                               dual_subtitle=False, dual_translation_first=False, translate_existing='')
                events = []
                with patch.object(T, 'emit', side_effect=lambda kind, **data: events.append((kind, data))), \
                        patch.object(T, 'llm_translate', side_effect=AssertionError('provider must not be called')), \
                        redirect_stdout(io.StringIO()):
                    T.translate_existing_subtitle(args)
                self.assertFalse(list(root.glob('*.partial.*')))
                done = next(data for kind, data in events if kind == 'done')
                self.assertEqual(done['outputs'][0]['status'], 'complete')

    def test_download_does_not_delete_another_invocations_temporary_files(self):
        import media
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            other = root / 'another.invtmp-video'
            other.write_bytes(b'active download fixture')
            class Response(io.BytesIO):
                headers = {'Content-Length': '7'}
            def mux(args, **kwargs):
                Path(args[-1]).write_bytes(b'output')
                return types.SimpleNamespace(returncode=0)
            with patch.object(media, '_find_ffmpeg', return_value='ffmpeg-fixture'), \
                    patch('urllib.request.urlopen', side_effect=lambda *a, **k: Response(b'fixture')), \
                    patch('subprocess.run', side_effect=mux), redirect_stdout(io.StringIO()):
                media.download_stream('https://example.test/video', '', 'fixture', 720, '', directory)
            self.assertEqual(other.read_bytes(), b'active download fixture')
            self.assertEqual(list(root.glob('*.invtmp-*')), [other])

    def test_dialogue_markers_do_not_turn_initial_verbs_into_names(self):
        for dash in ('-', '–', '—'):
            self.assertEqual(part_anchor_issue([f'{dash} Don\'t move!'], [f'{dash} Kımıldama!']), '')
            self.assertEqual(part_anchor_issue([f'{dash} Wait for me!'], [f'{dash} Beni bekle!']), '')
        self.assertTrue(part_anchor_issue(['- Please call John.'], ['- Lütfen ara.']))

    def test_meridiem_time_conversion_and_changed_time_rejection(self):
        for source, target in [('5:30 p.m.', '17.30'), ('12:15 a.m.', '00.15'),
                               ('12:15 p.m.', '12.15'), ('5:30 a.m.', '05.30')]:
            source = f'Call me at {source} tomorrow.'
            target = f'Yarın {target} beni ara.'
            self.assertEqual(part_anchor_issue([source], [target]), '')
            self.assertNotIn('number_mismatch', translation_meaning_issues(source, target, 'tr'))
        self.assertIn('number_mismatch', translation_meaning_issues('Call at 5:30 p.m.', '17.45 ara.', 'tr'))
        self.assertTrue(part_anchor_issue(['Call at 5:30 p.m.'], ['05.30 ara.']))

    def test_short_merge_keeps_new_dialogue_separate(self):
        for reply in ('- No.', '– No.', '— No.'):
            entries = [(0, 2, 'I told you to wait.'), (2.1, 2.6, reply)]
            self.assertEqual(T.merge_short_entries(entries), entries)

    def test_short_turkish_body_is_detected_without_trusting_filename(self):
        self.assertTrue(T.file_looks_turkish([(0, 1, 'Merhaba nasılsın?'), (1, 2, 'Ben bugün çok iyiyim.')]))
        self.assertFalse(T.file_looks_turkish([(0, 1, 'Hello there.'), (1, 2, 'Ben eve gidiyorum.')]))

    def test_celsius_word_order_is_not_a_lost_unit_or_name(self):
        source, target = 'It is 30 degrees Celsius.', '30 derece santigrat.'
        self.assertEqual(part_anchor_issue([source], [target]), '')
        self.assertNotIn('unit_mismatch', translation_meaning_issues(source, target, 'tr'))
        self.assertIn('unit_mismatch', translation_meaning_issues(source, '30 derece Fahrenheit.', 'tr'))


if __name__ == '__main__':
    unittest.main()
