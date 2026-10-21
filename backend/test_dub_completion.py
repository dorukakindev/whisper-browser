"""Global similarity must not conceal missing endings or whole clauses."""
from pathlib import Path
import sys
import unittest
sys.path.insert(0, str(Path(__file__).resolve().parents[1]/'tools/voxcpm2'))
from dub_quality import speech_check


class Completion(unittest.TestCase):
    def setUp(self):
        self.text = ' '.join('sözcük'+str(i) for i in range(60))

    def test_short_lost_ending_is_visible_despite_high_total_similarity(self):
        result = speech_check(self.text, ' '.join(self.text.split()[:-3]))
        self.assertGreater(result['similarity'], .95)
        self.assertTrue(result['omission_spans']); self.assertTrue(result['review'])

    def test_internal_missing_clause_and_inserted_phrase_are_reported(self):
        words = self.text.split()
        self.assertTrue(speech_check(self.text, ' '.join(words[:20]+words[24:]))['omission_spans'])
        self.assertTrue(speech_check(self.text, ' '.join(words[:20]+['bir','yeni','eklenmiş','cümle']+words[20:]))['insertion_spans'])

    def test_single_asr_substitution_and_punctuation_do_not_create_a_gap(self):
        text = 'Akşam güneşi denizin üzerinde yavaşça kayboluyordu. Sahilde yürüyen insanlar sessizce izliyordu.'
        result = speech_check(text, text.replace('yavaşça', 'yavaşca').replace('.', ','))
        self.assertFalse(result['omission_spans']); self.assertFalse(result['insertion_spans'])
        self.assertFalse(result['review'])


if __name__ == '__main__': unittest.main()
