import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools' / 'voxcpm2'))
from dub_pronunciation import normalize, apply, cache_identity, render


class PronunciationTests(unittest.TestCase):
    def test_literal_single_pass_boundaries(self):
        entries=normalize([{'from':'Newton','to':'Nyutın'},{'from':'New','to':'Nü'}, {'from':'Nyutın','to':'OTHER'}])
        self.assertEqual(apply("Newton'ın New Newtonian new",entries),"Nyutın'ın Nü Newtonian new")

    def test_no_regex_or_cascade(self):
        self.assertEqual(apply('A+B AAB',normalize([{'from':'A+B','to':'X'}])),'X AAB')
        self.assertEqual(apply('A B',normalize([{'from':'A','to':'B'},{'from':'B','to':'C'}])),'B C')

    def test_unchanged_source_and_other_groups(self):
        text='Newton konuştu.'
        entries=normalize([{'from':'Newton','to':'Nyutın'}])
        self.assertEqual(apply(text,entries),'Nyutın konuştu.')
        self.assertEqual(text,'Newton konuştu.')
        self.assertEqual(apply('Öteki grup.',entries),'Öteki grup.')

    def test_invalid_entries(self):
        for entries in ([{'from':'123','to':'x'}],[{'from':'A\nB','to':'x'}],[{'from':'A','to':'B'},{'from':'A','to':'C'}]):
            with self.assertRaises(ValueError): normalize(entries)

    def test_only_matching_group_cache_changes(self):
        entries=normalize([{'from':'Newton','to':'Nyutın'}])
        self.assertEqual(cache_identity(('old',),'Diğer grup.',entries),('old',))
        self.assertEqual(cache_identity(('old',),'Newton konuştu.',[]),('old',))
        self.assertNotEqual(cache_identity(('old',),'Newton konuştu.',entries),('old',))

    def test_dictionary_precedes_default_expansion(self):
        entries=normalize([{'from':'Dr. Newton','to':'Doktor Nyutın'},
                           {'from':'Nyutın','to':'OTHER'}])
        self.assertEqual(render('Dr. Newton 5 kitap aldı.',entries),'Doktor Nyutın beş kitap aldı.')


if __name__ == '__main__': unittest.main()
