import unittest
import sentence_translation as S

class TurkishNegationContextTests(unittest.TestCase):
    def test_nominal_forms_are_not_standalone_negative_verbs(self):
        good=[('I need to call the office.','Ofisi aramam gerekiyor.'),('I need to do it.','Bunu yapmam gerekiyor.'),('We need to do it.','Bunu yapmamız lazım.'),('I have 3 apples.','3 elmam var.'),('Okay.','Tamam.'),('This is a bathhouse.','Bu bir hamam.'),('Come before delivery arrives.','Teslimat gelmeden önce gel.')]
        for source,target in good:
            with self.subTest(target=target):self.assertNotIn('negation_added',S.translation_blocking_issues(source,target,'tr','en'))
        for target in ['Yapmam.','Gelemem.','Bunu yapmam gerekmiyor.','Okuyamam.']:
            with self.subTest(target=target):self.assertIn('negation_added',S.translation_blocking_issues('I can do it.',target,'tr','en'))
        self.assertIn('negation_missing',S.translation_blocking_issues('Do not call before delivery arrives.','Teslimat gelmeden önce ara.','tr','en'))

if __name__=='__main__':unittest.main()
