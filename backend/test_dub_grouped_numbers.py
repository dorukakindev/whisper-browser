import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools' / 'voxcpm2'))
from dub_quality import speech_check


class GroupedNumbers(unittest.TestCase):
    def test_asr_thousands_with_exact_spoken_evidence(self):
        self.assertFalse(speech_check('İnsanlığın elli bin yıllık tarihi.', 'İnsanlığın 50.000 yıllık tarihi.')['review'])
        self.assertFalse(speech_check('Tam bir milyon kişi geldi.', 'Tam 1.000.000 kişi geldi.')['review'])
        self.assertFalse(speech_check('Tam elli bin kişi geldi.', 'Tam 50 bin kişi geldi.')['review'])

    def test_wrong_quantities_and_extra_occurrences_still_fail(self):
        for expected, actual in [('Elli kişi geldi.', '50.000 kişi geldi.'),
                                 ('Yüz elli bin kişi geldi.', '50.000 kişi geldi.'),
                                 ('Elli bin kişi geldi.', '50.000 kişi ve 50.000 kişi geldi.'),
                                 ('Elli bin kişi geldi.', '5.000 kişi geldi.')]:
            self.assertTrue(speech_check(expected, actual)['review'], (expected, actual))
        self.assertTrue(speech_check('Elli kişi geldi.', '50 bin kişi geldi.')['review'])

    def test_exact_name_with_same_case_ending_is_not_a_missing_name(self):
        self.assertEqual(speech_check("Venüs'e ulaşacağız.", 'Venüse ulaşacağız.')['missing_names'],[])
        self.assertFalse(speech_check("Venüs'e ulaşacağız.", 'Venüse ulaşacağız.')['review'])
        self.assertEqual(speech_check("Ankara'dan geldim.", 'Ankaradan geldim.')['missing_names'],[])
        for heard in ['Venise ulaşacağız.','Vene ulaşacağız.','Ulaşacağız.']:
            self.assertIn('Venüs',speech_check("Venüs'e ulaşacağız.",heard)['missing_names'])


if __name__ == '__main__':
    unittest.main()
