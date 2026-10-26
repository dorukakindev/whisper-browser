import sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path('backend').resolve()))
sys.path.insert(0,str(Path('tools/voxcpm2').resolve()))
from sentence_translation import translation_meaning_issues as issues
from dub_quality import speech_check
class Product603(unittest.TestCase):
 def test_translation_quantities_are_consumed(self):
  bad=[('3 men and 3 women.','3 erkek ve kadın.'),('Three people died.','Beş kişi öldü.'),('Twenty-five people arrived.','Yirmi kişi geldi.'),('Two hundred people arrived.','İki kişi geldi.')]
  for a,b in bad:
   with self.subTest(a=a):self.assertIn('number_mismatch',issues(a,b,'tr'))
  good=[('3 million people.','Üç milyon kişi.'),('10 thousand people.','On bin kişi.'),('One hundred and five people.','Yüz beş kişi.'),('3 men and 3 women.','Üç erkek ve 3 kadın.'),('Three people arrived.','Üç kişi geldi.'),('Twenty-five people arrived.','Yirmi beş kişi geldi.'),('Two hundred people arrived.','İki yüz kişi geldi.'),('Thirty five people arrived.','Otuz beş kişi geldi.'),('One must think.','Düşünmek gerekir.'),('I like that one.','Onu beğendim.'),('We walked 5 miles.','8 kilometre yürüdük.'),('It starts at 5:30 p.m.','17.30 saatinde başlıyor.')]
  for a,b in good:
   with self.subTest(a=a):self.assertNotIn('number_mismatch',issues(a,b,'tr'))
 def test_other_languages_keep_their_existing_number_contract(self):
  self.assertNotIn('number_mismatch',issues('Twenty people arrived.','Zwanzig Leute kamen.','de'))
  self.assertNotIn('number_mismatch',issues('3 million people.','3 Millionen Menschen.','de'))
 def test_asr_written_quantities_and_equivalence(self):
  prefix='Bu uzun açıklamanın içinde bütün bilgiler özenle kaydedilir ve sonunda herkes tarafından dikkatle incelenir. '
  for a,b in [('üç kişi','kişi'),('kişi','üç kişi'),('üç erkek ve üç kadın','üç erkek ve kadın')]:
   with self.subTest(a=a):self.assertTrue(speech_check(prefix+a,prefix+b)['spoken_number_mismatch'])
  for a,b in [('25 kişi geldi.','yirmi beş kişi geldi.'),('3,5 kişi.','üç virgül beş kişi.'),('Işık ılık.','ışık ılık.'),("TBMM'de konuştu.",'TBMMde konuştu.'),('I can read.','I can read.')]:
   with self.subTest(a=a):self.assertFalse(speech_check(a,b)['review'],speech_check(a,b))
if __name__=='__main__':unittest.main()
