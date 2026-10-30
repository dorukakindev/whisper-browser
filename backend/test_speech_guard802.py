import unittest
import sentence_translation as S

class SpeechMeaningTests(unittest.TestCase):
    def test_observed_uncertainty_and_lexical_negation(self):
        for source,target in [
            ('No idea how this may play out.','Bunun nasıl sonuçlanacağı hakkında hiçbir fikrim yok.'),
            ('The unpredictability is extraordinary.','Öngörülemezlik olağanüstü.'),
            ('Pretty ruthlessly.','Oldukça acımasızca.'),
        ]:
            with self.subTest(source=source):self.assertEqual(S.translation_blocking_issues(source,target,'tr','en'),[])
    def test_independent_negation_and_certainty_still_fail(self):
        for source,target,issue in [
            ('It may rain.','Kesinlikle yağacak.','modal_certainty_flip'),
            ('The unpredictable test succeeded.','Öngörülemez test başarılı olmadı.','negation_added'),
            ('He acted ruthlessly.','Acımasızca davranmadı.','negation_added'),
            ('He did not act ruthlessly.','Acımasızca davrandı.','negation_missing'),
            ('The result is not unpredictable.','Sonuç öngörülemez.','negation_missing'),
        ]:
            with self.subTest(source=source):self.assertIn(issue,S.translation_blocking_issues(source,target,'tr','en'))

class TranslationMetricTests(unittest.TestCase):
    def test_fallback_failures_share_the_reply_denominator(self):
        import test_transcribe as F
        def answer(payload):
            data=F._sentence_reply(payload)
            if len(payload['sentence_groups'])==1:return {}
            first=payload['sentence_groups'][0]['ids']
            for key in first:data['items'].pop(str(key),None)
            data['sentences'].pop(str(first[0]),None)
            return data
        _,seen,events,_=F._sentence_translate(F._SENTENCE_SOURCE,F._TrArgs(translate_cache=False),answer)
        quality=next(data for kind,data in events if kind=='translation_quality')
        self.assertGreater(quality['fallback_requests'],0)
        self.assertLessEqual(quality['invalid_batches'],quality['batches'])
        self.assertEqual(quality['batches'],len(seen))

if __name__=='__main__':unittest.main()
