import os
from pathlib import Path
import sys
import unittest
ROOT=Path(os.environ.get('REPORT496_BASE',Path(__file__).resolve().parents[1]))
sys.path.insert(0,str(ROOT/'backend'))
from translation_memory import fuzzy_semantically_compatible as compatible
class Memory496(unittest.TestCase):
 def test_17_percent_is_not_an_ordinary_number(self):
  self.assertFalse(compatible('The reported success rate was 50%.','The reported success rate was 50.'))
 def test_18_quoted_questions_are_not_statements(self):
  self.assertFalse(compatible('"The gate is open?"','"The gate is open."'))
 def test_19_initial_acronyms_are_not_pronouns(self):
  self.assertFalse(compatible('US officials arrived today.','us officials arrived today.'))
 def test_20_ambiguous_real_words_are_not_fillers(self):
  self.assertFalse(compatible('Bu er yarın buraya gelecek.','Bu yarın buraya gelecek.'))
  self.assertFalse(compatible('Wir kommen um acht Uhr.','Wir kommen acht Uhr.'))
  self.assertTrue(compatible('I, uh, think this is fine.','I think this is fine.'))
if __name__=='__main__':unittest.main()
