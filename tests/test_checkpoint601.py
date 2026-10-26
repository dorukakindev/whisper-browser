import sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path('backend').resolve()))
sys.path.insert(0,str(Path('tools/voxcpm2').resolve()))
from sentence_translation import translation_blocking_issues,part_anchor_issue
from dub_quality import speech_check,lexical_negatives
class Checkpoint601(unittest.TestCase):
 def test_soft_future_is_not_rejected(self):
  for a,b in [('I will come tomorrow.','Yarın geleceğim.'),('We will win.','Kazanacağız.'),('I will help you.','Sana yardım edeceğim.'),('He will come tomorrow.','Yarın gelecek.')]:
   self.assertNotIn('modal_missing',translation_blocking_issues(a,b,'tr'))
  self.assertIn('modal_certainty_flip',translation_blocking_issues('He might come tomorrow.','Yarın gelecek.','tr'))
  self.assertIn('modal_weakened',translation_blocking_issues('You must come.','Gelebilirsin.','tr'))
 def test_initial_numbers_are_not_names(self):
  for a,b in [('Ten years later.','On yıl sonra.'),('Five years later.','Beş yıl sonra.')]:self.assertEqual(part_anchor_issue([a],[b],'tr'),'')
  self.assertIn('ozel_ad_bozulma',part_anchor_issue(['Lawson arrived.'],['Larson geldi.'],'tr'))
 def test_progressive_future_and_derived_negatives(self):
  before='Bu çok uzun açıklamada konuşmacı bugün bütün düşüncelerini dikkatli biçimde sırasıyla anlatırken '
  for bad,good in [('gelmiyor','geliyor'),('geçirmiyor','geçiriyor'),('geçirmeyecek','geçirecek'),('geçirmez','geçirir')]:
   self.assertEqual(lexical_negatives(bad),[bad]);self.assertTrue(speech_check(before+bad,before+good)['review'])
  for word in ['gelmeye','geçirmeye','elma','dondurma','çalışmaya']:
   self.assertEqual(lexical_negatives(word),[])
if __name__=='__main__':unittest.main()
