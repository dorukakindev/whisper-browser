import unittest
import sentence_translation as S


class SignedSpeechTests(unittest.TestCase):
    def test_reported_speech_stays_in_one_natural_phrase(self):
        source = 'He said, "I\'m fine." But his voice suggested something quite different.'
        target = '"İyiyim." dedi. Ama sesi bambaşka bir şey anlatıyordu.'
        self.assertEqual(S.sentence_part_boundary_issue([source], [target], 'en'), '')
        self.assertEqual(S.insert_sentence_breaks(target), '"İyiyim." dedi.\nAma sesi bambaşka bir şey anlatıyordu.')
        self.assertEqual(S.sentence_end_count('“Emin misin?” diye sordu.'), 1)
        for text in ['"İyiyim." Burada kalacağım.', '"İyiyim." dedi. Sonra eve gitti.']:
            self.assertTrue(S.sentence_part_boundary_issue(['He said, "I am fine."'], [text], 'en'))
        self.assertEqual(S.sentence_end_count('"Geldim. Buradayım." dedi.'), 2)
        from transcribe import wrap_text
        for text in [target, S.insert_sentence_breaks(target)]:
            self.assertEqual(wrap_text(text, wrap_mode='sentence'), '"İyiyim." dedi.\nAma sesi bambaşka bir şey anlatıyordu.')

    def test_live_correct_spoken_temperature_change(self):
        source = 'The temperature fell from five degrees to minus five. That is a ten-degree drop.'
        target = 'Sıcaklık beş dereceden eksi beşe düştü. Bu, on derecelik bir düşüş demek.'
        self.assertEqual(S.translation_meaning_issues(source, target, 'tr', 'en'), [])

    def test_explicit_sign_is_not_lost_or_reused(self):
        for source, target, correct in [
            ('The value is minus five.', 'Değer eksi beşti.', True),
            ('The value is negative five.', 'Değer eksi beş.', True),
            ('The value is minus-five.', 'Değer eksi beş.', True),
            ('The value is minus one.', 'Değer eksi bir.', True),
            ('The value is minus one.', 'Değer bir.', False),
            ('The value is minus 5.', 'Değer eksi beş.', True),
            ('The value is minus 5.', 'Değer beş.', False),
            ('The value is minus five.', 'Değer beş.', False),
            ('The value is five.', 'Değer eksi beş.', False),
            ('Five and minus five.', 'Beş ve beş.', False),
            ('Five and minus five.', 'Eksi beş.', False),
            ('Minus five and minus ten.', 'Eksi beş ve eksi on.', True),
        ]:
            with self.subTest(source=source, target=target):
                issues = S.translation_meaning_issues(source, target, 'tr', 'en')
                self.assertEqual('number_mismatch' not in issues, correct)


if __name__ == '__main__':
    unittest.main()
