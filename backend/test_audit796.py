import unittest,sys,json,tempfile
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parent));import sentence_translation as S
import test_audit794 as P
BAD=[('Başlamalısın.','You start.','tr','en','modal_weakened'),('Başlayabilirdin.','You started.','tr','en','modal_certainty_flip'),('Başlardın.','You start.','tr','en','modal_missing'),('They used to live here.','Burada yaşadılar.','en','tr','modal_missing'),('The code is 7.500.','Kod 7.050.','en','tr','number_mismatch'),('The team scored 4-1.','Takım 1-4 kazandı.','en','tr','number_mismatch'),('One build failed and one succeeded.','İki derleme de başarılı oldu.','en','tr','outcome_reversed'),('The result was not a failure.','Sonuç başarısızlıktı.','en','tr','outcome_reversed'),('This is a complete sentence.','Bu','en','tr','truncated_fragment'),('Before the alarm rings, leave.','Alarm çaldıktan sonra çık.','en','tr','temporal_reversed'),('Until Friday, stay here.','Cuma gününden sonra burada kal.','en','tr','temporal_reversed')]
GOOD=[('Başlamalısın.','You should start.','tr','en'),('Başlayabilirdin.','You could have started.','tr','en'),('Başlardın.','You used to start.','tr','en'),('They used to live here.','Burada yaşarlardı.','en','tr'),('They used to live here.','Eskiden burada yaşadılar.','en','tr'),('They used to be ill.','Hastaydılar.','en','tr'),('The code is 7.500.','Kod 7.500.','en','tr'),('The team scored 4-1.','Takım 4-1 kazandı.','en','tr'),('One build failed and one succeeded.','Bir derleme başarısız, diğeri başarılı oldu.','en','tr'),('The film called "Failure" won.','"Başarısız" adlı film kazandı.','en','tr'),('The film called “Failure” won.','“Başarısız” adlı film kazandı.','en','tr'),('The result was not a failure.','Sonuç başarısızlık değildi.','en','tr'),('The result was not a failure.','Sonuç başarıydı.','en','tr'),('Before the alarm rings, leave.','Alarm çalmadan önce çık.','en','tr'),('After the alarm rings, leave.','Alarm çaldıktan sonra çık.','en','tr'),('Until Friday, stay here.','Cuma gününe kadar burada kal.','en','tr'),('This is a complete sentence.','Bu tam bir cümle.','en','tr'),('Yes.','Evet.','en','tr'),('It is this.','Bu.','en','tr')]
class Audit796(unittest.TestCase):
 def test_reported_bad_cases_and_good_counterparts(self):
  for source,target,sl,tl,issue in BAD:
   with self.subTest(source=source,target=target):self.assertIn(issue,S.translation_blocking_issues(source,target,tl,sl))
  for source,target,sl,tl in GOOD:
   with self.subTest(source=source,target=target):self.assertEqual(S.translation_blocking_issues(source,target,tl,sl),[])
 def test_production_pipeline_rejects_both_modes(self):
  with patch.object(P,'BAD',BAD):P.Audit794('test_pipeline_rejects_bad_candidates_in_normal_and_speech_modes').test_pipeline_rejects_bad_candidates_in_normal_and_speech_modes()
 def test_production_pipeline_accepts_good_counterparts(self):
  for row in GOOD:
   with self.subTest(pair=row),patch.object(P,'GOOD',[row]):
    P.Audit794('test_pipeline_accepts_correct_outcomes_and_modal_alternatives').test_pipeline_accepts_correct_outcomes_and_modal_alternatives()
if __name__=='__main__':unittest.main()
