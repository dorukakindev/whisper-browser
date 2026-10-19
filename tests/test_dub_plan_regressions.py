import hashlib
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools' / 'voxcpm2'))
import dub_plan


class DubPlanRegressionTests(unittest.TestCase):
    def test_source_hash_identifies_the_bytes_used_to_build_the_plan(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / 'Türkçe.srt'
            original = b'1\n00:00:00,000 --> 00:00:02,000\nOriginal sentence.\n\n'
            source.write_bytes(original)
            make_groups = dub_plan.make_groups

            def change_after_parse(cues, *args):
                source.write_text('1\n00:00:00,000 --> 00:00:02,000\nChanged sentence.\n\n', encoding='utf-8')
                return make_groups(cues, *args)

            with patch.object(dub_plan, 'make_groups', side_effect=change_after_parse):
                result = dub_plan.plan(source)
            self.assertEqual(result['groups'][0]['text'], 'Original sentence.')
            self.assertEqual(result['sourceHash'], hashlib.sha256(original).hexdigest())

    def test_long_timestamps_do_not_wrap_at_two_hour_digits(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / 'long.srt'
            source.write_text('1\n100:00:00,000 --> 100:00:02,000\nLong recording.\n\n', encoding='utf-8')
            self.assertEqual(dub_plan.parse_srt(source), [(360000000, 360002000, 'Long recording.')])

    def test_invalid_clock_components_are_not_silently_converted(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / 'invalid.srt'
            for timing in ['00:99:00,000 --> 01:40:00,000', '-01:00:00,000 --> 01:00:02,000']:
                source.write_text(f'1\n{timing}\nSpeech.\n\n', encoding='utf-8')
                self.assertEqual(dub_plan.parse_srt(source), [], timing)

    def test_bom_windows_newlines_and_subsecond_timestamps_still_parse(self):
        payload = '\ufeff1\r\n00:00:00,1 --> 00:00:01,25\r\nTürkçe ışık.\r\n\r\n'.encode('utf-8')
        self.assertEqual(dub_plan.parse_srt('unread-file.srt', payload), [(100, 1250, 'Türkçe ışık.')])

    def test_plan_rejects_oversized_input_before_building_groups(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / 'large.srt'
            source.write_bytes(b'x' * 2_000_001)
            with patch.object(dub_plan, 'make_groups') as grouping:
                with self.assertRaises(ValueError):
                    dub_plan.plan(source)
                grouping.assert_not_called()


if __name__ == '__main__':
    unittest.main()
