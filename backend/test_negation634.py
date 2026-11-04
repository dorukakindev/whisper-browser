import unittest
import sentence_translation as S

class TurkishNegationContextTests(unittest.TestCase):
    def test_undecided_is_lexical_without_hiding_independent_negation(self):
        source = 'A few undecided races will determine how badly Republicans lost.'
        target = 'Birkaç kararsız yarış, Cumhuriyetçilerin ne kadar kötü kaybettiğini belirleyecek.'
        self.assertNotIn('negation_added', S.translation_blocking_issues(source, target, 'tr', 'en'))
        self.assertIn('negation_added', S.translation_blocking_issues(
            source, 'Birkaç kararsız yarış sonucu belirlemeyecek.', 'tr', 'en'))
        self.assertIn('negation_missing', S.translation_blocking_issues(
            'Undecided races will not determine the result.', 'Kararsız yarışlar sonucu belirleyecek.', 'tr', 'en'))

    def test_nominal_locatives_do_not_invent_negation(self):
        for source, target in [
            ('Link in the description.', 'Bağlantı açıklamada.'),
            ('The result is in the study.', 'Sonuç çalışmada.'),
            ('The setting is in the application.', 'Ayar uygulamada.'),
        ]:
            with self.subTest(target=target):
                self.assertNotIn('negation_added', S.translation_blocking_issues(source, target, 'tr', 'en'))
        for target in ['Bunu açıklamadı.', 'Bunu açıklamadan gitti.', 'Orada çalışmadık.', 'Bunu uygulamadım.']:
            with self.subTest(target=target):
                self.assertIn('negation_added', S.translation_blocking_issues('He explained it.', target, 'tr', 'en'))

    def test_nominal_forms_are_not_standalone_negative_verbs(self):
        good=[('I need to call the office.','Ofisi aramam gerekiyor.'),('I need to do it.','Bunu yapmam gerekiyor.'),('We need to do it.','Bunu yapmamız lazım.'),('I have 3 apples.','3 elmam var.'),('Okay.','Tamam.'),('This is a bathhouse.','Bu bir hamam.'),('Come before delivery arrives.','Teslimat gelmeden önce gel.')]
        for source,target in good:
            with self.subTest(target=target):self.assertNotIn('negation_added',S.translation_blocking_issues(source,target,'tr','en'))
        for target in ['Yapmam.','Gelemem.','Bunu yapmam gerekmiyor.','Okuyamam.']:
            with self.subTest(target=target):self.assertIn('negation_added',S.translation_blocking_issues('I can do it.',target,'tr','en'))
        self.assertIn('negation_missing',S.translation_blocking_issues('Do not call before delivery arrives.','Teslimat gelmeden önce ara.','tr','en'))

if __name__=='__main__':unittest.main()
