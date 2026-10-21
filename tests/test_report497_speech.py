import os
import sys
import tempfile
import unittest
from pathlib import Path

root = Path(os.environ.get('REPORT497_BASE', Path(__file__).resolve().parents[1]))
sys.path[:0] = [str(root / 'tools' / 'voxcpm2'), str(Path(__file__).resolve().parents[1] / 'backend')]
from dub_plan import parse_srt
from dub_quality import speech_check
from dub_finish import spoken_text

PREFIX = 'Bugün burada yapılan bütün incelemeler ve deneyler sonrasında açıklanan sonuç şu: '

class Speech497(unittest.TestCase):
    def test_497_16_percent_is_spoken_and_lost_percent_is_reviewed(self):
        expected = PREFIX + 'oran %50 oldu.'
        self.assertTrue(speech_check(expected, PREFIX + 'oran 50 oldu.')['review'])
        self.assertIn('yüzde elli', spoken_text('%50'))
        self.assertIn('yüzde elli', spoken_text('50%'))
        self.assertFalse(speech_check(expected, PREFIX + 'oran yüzde elli oldu.')['review'])

    def test_497_17_invented_quantity_cannot_pass_high_global_similarity(self):
        result = speech_check(PREFIX + '12 kişi geldi.', PREFIX + '12 kişi geldi ve 13 bekledi.')
        self.assertGreater(result['similarity'], .85)
        self.assertTrue(result['review'])
        self.assertEqual(result['added_numbers'], ['13'])
        self.assertFalse(speech_check('On iki kişi geldi.', '12 kişi geldi.')['review'])

    def test_497_18_quantities_remain_bound_to_their_units(self):
        expected = PREFIX + '3 km ve 5 kg ölçüldü.'
        actual = PREFIX + '3 kg ve 5 km ölçüldü.'
        self.assertTrue(speech_check(expected, actual)['review'])
        self.assertFalse(speech_check(expected, PREFIX + 'üç kilometre ve beş kilogram ölçüldü.')['review'])

    def read(self, text):
        with tempfile.TemporaryDirectory() as folder:
            file = Path(folder) / 'subtitle.srt'
            file.write_text('1\n00:00:01,000 --> 00:00:03,000\n' + text + '\n', encoding='utf-8-sig')
            return parse_srt(file)[0][2]

    def test_497_19_srt_does_not_delete_mathematical_angle_expressions(self):
        self.assertEqual(self.read('x<y>z ve <b>kalın</b> yazı.'), 'x<y>z ve kalın yazı.')

    def test_497_20_srt_control_bytes_do_not_reach_the_speech_model(self):
        self.assertEqual(self.read('Mer\x00ha\x07ba dünya.'), 'Merhaba dünya.')

if __name__ == '__main__':
    unittest.main()
