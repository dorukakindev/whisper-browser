import unittest
import sentence_translation as S

class QuantityTests(unittest.TestCase):
    def test_percent_unit_cannot_disappear_or_be_added(self):
        for a,b in [('It fell by 5%.','5 düştü.'),('It fell by 5%.','Beş düştü.'),('It fell by 5.','Yüzde 5 düştü.'),('It fell by 5.','Yüzde beş düştü.')]:
            with self.subTest(source=a,target=b):self.assertIn('percentage_mismatch',S.translation_blocking_issues(a,b,'tr','en'))
    def test_localized_quantities_and_spoken_negative_past(self):
        for a,b in [('It fell by 5%.','Yüzde beş düştü.'),('The rate was 1.5%.','Oran yüzde 1,5 idi.'),('It cost 1,234.50 dollars.','1.234,50 dolardı.'),('The value was -5.','Değer eksi beşti.'),('The value was 5.','Değer beşti.')]:
            with self.subTest(source=a,target=b):self.assertEqual(S.translation_blocking_issues(a,b,'tr','en'),[])
    def test_added_or_missing_sign_and_quantity_still_fail(self):
        for a,b in [('The value was 5.','Değer eksi beşti.'),('The value was 5.','Değer eksi 5 idi.'),('The value was -5.','Değer beşti.'),('There were 12 people.','2 kişi vardı.'),('The balance was 5000.','Bakiye eksi 5 bin idi.')]:
            with self.subTest(source=a,target=b):self.assertIn('number_mismatch',S.translation_blocking_issues(a,b,'tr','en'))
    def test_unknown_language_and_multiple_quantities_are_not_new_percent_proofs(self):
        self.assertNotIn('percentage_mismatch',S.translation_blocking_issues('5%.','5 pour cent.','fr','en'))
        self.assertNotIn('percentage_mismatch',S.translation_blocking_issues('5% and 10%.','5 ve 10.','tr','en'))
