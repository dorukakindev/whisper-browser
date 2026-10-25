import unittest
from sentence_translation import translation_blocking_issues


class SpeechQuantitySwapTests(unittest.TestCase):
    def test_unchanged_amount_wrong_unit(self):
        for source,target,issue in [('I paid $45.','45 lira ödedim.','currency_mismatch'),
                                    ('It costs $100.','100 € tutuyor.','currency_mismatch'),
                                    ('We drove 60 miles.','60 kilometre gittik.','unit_mismatch')]:
            self.assertIn(issue,translation_blocking_issues(source,target))

    def test_real_conversion_and_same_unit(self):
        for source,target in [('We drove 60 miles.','96,56 kilometre gittik.'),
                              ('It costs $100.','100 dolar tutuyor.'),
                              ('It is 0 Celsius.','32 Fahrenheit.'),
                              ('One dollar equals one euro.','Bir dolar bir avroya eşdeğer.'),
                              ('Exchange $45 for 45 euros.','45 doları 45 avroya çevir.')]:
            issues=translation_blocking_issues(source,target)
            self.assertNotIn('currency_mismatch',issues)
            self.assertNotIn('unit_mismatch',issues)


if __name__=='__main__':unittest.main()
