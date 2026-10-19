import sys
import tempfile
import unittest
import os
import io
from contextlib import redirect_stdout
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools' / 'voxcpm2'))
import dub_plan


class Report467Tests(unittest.TestCase):
    def test_only_old_managed_temps_with_dead_owners_are_cleaned(self):
        import media
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            token = 'a' * 32
            stale = root / f'film.invtmp-123-{token}-video'
            active = root / f'film.invtmp-456-{token}-audio'
            fresh = root / f'film.invtmp-789-{token}-video'
            legacy = root / f'film.invtmp-{token}-video'
            unrelated = root / 'notes.txt'
            for file in (stale, active, fresh, legacy, unrelated):
                file.write_bytes(b'keep except dead fixture')
                os.utime(file, (100000, 100000))
            os.utime(fresh, (200000, 200000))
            self.assertEqual(media.cleanup_stale_stream_temps(root, now=200000,
                             pid_alive=lambda pid: pid == 456), 1)
            self.assertFalse(stale.exists())
            for file in (active, fresh, legacy, unrelated):
                self.assertTrue(file.exists())

    def test_sample_warns_about_unapplied_full_plan_edits_without_modifying_them(self):
        groups = [{'source_ids': [1], 'text': 'Original.'}]
        document = {'sourceHash': 'fixture', 'edits': {'1': 'Applied.', '12': 'Outside sample.'}}
        output = io.StringIO()
        with redirect_stdout(output):
            dub_plan.apply_edits(groups, document, 'fixture')
        self.assertIn('DUB_WARNING sample_edits_unused', output.getvalue())
        self.assertEqual(groups[0]['text'], 'Applied.')
        self.assertEqual(document['edits']['12'], 'Outside sample.')

    def test_legacy_and_unicode_subtitle_encodings_keep_text_and_original_byte_hash(self):
        body = '1\n00:00:00,000 --> 00:00:01,000\nTürkçe ışığı çalışıyor.\n\n'
        for encoding in ('utf-8-sig', 'cp1254', 'utf-16', 'utf-16be'):
            data = body.encode(encoding)
            if encoding == 'utf-16be':
                data = b'\xfe\xff' + data
            self.assertEqual(dub_plan.parse_srt('unread.srt', data), [(0, 1000, 'Türkçe ışığı çalışıyor.')], encoding)
            with tempfile.TemporaryDirectory() as folder:
                file = Path(folder) / 'Türkçe.srt'
                file.write_bytes(data)
                import hashlib
                self.assertEqual(dub_plan.plan(file)['sourceHash'], hashlib.sha256(data).hexdigest())


if __name__ == '__main__':
    unittest.main()
