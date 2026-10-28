import unittest
import sentence_translation as S
import transcribe as T

class Fidelity733Tests(unittest.TestCase):
 def test_quantified_only_is_not_a_corrupted_name(self):
  source='Only three of the twelve samples passed; the other nine need another test.'
  target='On iki numuneden yalnızca üçü geçti; diğer dokuzunun başka bir teste ihtiyacı var.'
  self.assertEqual(S.part_anchor_issue([source],[target],'tr','en'),'')
  self.assertNotIn('number_mismatch',S.translation_blocking_issues(source,target,'tr','en'))
 def test_actual_initial_names_stay_protected(self):
  for source,target in [('Lawson arrived.','Larson geldi.'),('Only arrived.','Ony geldi.')]:
   self.assertIn('ozel_ad_bozulma',S.part_anchor_issue([source],[target],'tr','en'))
 def test_possessive_quantities_keep_values(self):
  for source,target in [('Nine need a new test.','Dokuzunun yeni bir teste ihtiyacı var.'),('Three passed.','Üçünün geçtiği görüldü.'),('Four need a test.','Dördünün teste ihtiyacı var.')]:
   self.assertNotIn('number_mismatch',S.translation_blocking_issues(source,target,'tr','en'))
  for target in ['Sekizinin teste ihtiyacı var.','Doksanının teste ihtiyacı var.','Dokuz yüzünün teste ihtiyacı var.']:
   self.assertIn('number_mismatch',S.translation_blocking_issues('Nine need a test.',target,'tr','en'))
 def test_availability_idiom_does_not_relax_arbitrary_ratios(self):
  self.assertNotIn('number_mismatch',S.translation_blocking_issues('It is 24/7.','Yedi yirmi dört açık.','tr','en'))
  for source,target in [('It is 24/7.','Yedi yirmi üç açık.'),('The ratio is 24/8.','Yedi yirmi dört açık.')]:
   self.assertIn('number_mismatch',S.translation_blocking_issues(source,target,'tr','en'))
 def test_both_speech_passes_protect_relation_and_focus(self):
  for prompt in [T.build_translate_prompt('tr','en',[],for_speech=True),T.build_refine_prompt('tr',for_speech=True)]:
   self.assertIn('sahiplik ile aliciyi',prompt)
   self.assertIn('olumsuzlugun odagi',prompt)
  self.assertNotIn('sahiplik ile aliciyi',T.build_translate_prompt('tr','en',[]))

if __name__=='__main__':unittest.main()
