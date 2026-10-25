import unittest
from sentence_translation import translation_meaning_issues


class SpeechControlIdioms(unittest.TestCase):
    def test_affirmative_cannot_help_but(self):
        for source in ["Such a pace cannot help but create new problems.",
                       "Such a pace cannot help, but create new problems.",
                       "I can't help but smile."]:
            self.assertNotIn('negation_missing', translation_meaning_issues(source, 'Bu durum yeni sorunlar yaratır; gülümserim.'))

    def test_real_negative_clauses_remain_protected(self):
        for source in ["I cannot help the child.", "I cannot help, but I can listen.",
                       "I cannot help but feel that this is not right.",
                       "I cannot create new problems."]:
            self.assertIn('negation_missing', translation_meaning_issues(source, 'Her şey yolunda, yardım edebilirim.'))

    def test_would_have_person_is_volition_only_with_target_evidence(self):
        source = 'Some would have us stay here a little longer.'
        self.assertNotIn('modal_missing', translation_meaning_issues(source, 'Bazıları burada biraz daha kalmamızı ister.'))
        self.assertIn('modal_missing', translation_meaning_issues('He would stay here.', 'Burada kaldı.'))
        self.assertIn('modal_weakened', translation_meaning_issues('Some would have us stay, but we must leave.', 'Bazıları kalmamızı ister, fakat gittik.'))


if __name__ == '__main__':
    unittest.main()
