"""External audit claims independently reproduced on the production acceptance path."""
import json
import types
import unittest
from unittest.mock import patch
import sentence_translation as S
import test_transcribe as F
T=F.T

BAD=[
 ('The experiment failed.','Deney başarılı oldu.','en','tr','outcome_reversed'),
 ('The experiment succeeded.','Deney başarısız oldu.','en','tr','outcome_reversed'),
 ('Deney başarılı oldu.','The experiment failed.','tr','en','outcome_reversed'),
 ('Deney başarısız oldu.','The experiment succeeded.','tr','en','outcome_reversed'),
 ('Beklemelisin.','You wait.','tr','en','modal_weakened'),
 ('Gidebilirdin.','You went.','tr','en','modal_certainty_flip'),
 ('Giderdin.','You go.','tr','en','modal_missing'),
 ('Yağabilir.','It rains.','tr','en','modal_certainty_flip')]
GOOD=[
 ('The experiment failed.','Deney başarısız oldu.','en','tr'),
 ('The experiment succeeded.','Deney başarılı oldu.','en','tr'),
 ('Deney başarılı oldu.','The experiment succeeded.','tr','en'),
 ('Deney başarısız oldu.','The experiment failed.','tr','en'),
 ('The experiment was not successful.','Deney başarılı olmadı.','en','tr'),
 ('Deney başarılı olmadı.','The experiment was not successful.','tr','en'),
 ('Beklemelisin.','You should wait.','tr','en'),
 ('Beklemelisin.','You ought to wait.','tr','en'),
 ('Gidebilirdin.','You could have gone.','tr','en'),
 ('Gidebilirdin.','You were able to go.','tr','en'),
 ('Giderdin.','You would go.','tr','en'),
 ('Giderdin.','You used to go.','tr','en'),
 ('Bilirdin.','You knew.','tr','en'),
 ('Alırdın.','You bought.','tr','en'),
 ('This is a failure mode.','Bu bir arıza türüdür.','en','tr'),
 ('Yağabilir.','It might rain.','tr','en'),
 ('Yağabilir.','It can rain.','tr','en'),
 ('Binanın temeli sağlam.','The foundation of the building is solid.','tr','en'),
 ('Oyunu bitirdin.','You finished the game.','tr','en')]

class Audit794(unittest.TestCase):
 def test_reversed_outcomes_and_lost_modals_are_blocked(self):
  for source,target,sl,tl,issue in BAD:
   with self.subTest(source=source):self.assertIn(issue,S.translation_blocking_issues(source,target,tl,sl))
 def test_correct_counterparts_are_not_rejected(self):
  for source,target,sl,tl in GOOD:
   with self.subTest(source=source,target=target):self.assertEqual(S.translation_blocking_issues(source,target,tl,sl),[])
 def test_outcome_titles_and_mixed_outcomes_do_not_force_polarity(self):
  self.assertEqual(S._outcome_polarities('A film called Unsuccessful.','en'),set())
  self.assertEqual(S._outcome_polarities('Başarılı adlı bir film.','tr'),set())
  self.assertEqual(S._outcome_polarities('One test failed; another succeeded.','en'),{-1,1})
  self.assertNotIn('outcome_reversed',S.translation_blocking_issues('One test failed; another succeeded.','Bir test başarılı, diğeri başarısız oldu.','tr','en'))
 def test_pipeline_accepts_correct_outcomes_and_modal_alternatives(self):
  for speech in (False,True):
   for source,target,sl,tl in GOOD[:15]:
    with self.subTest(speech=speech,source=source,target=target):
     status={}
     class Client:
      def __init__(self,**_):self.chat=types.SimpleNamespace(completions=self)
      def create(self,**kwargs):
       payload=json.loads(kwargs['messages'][-1]['content'])
       data={'items':{str(item['i']):target for item in payload['items']},'sentences':{str(g['ids'][0]):target for g in payload['sentence_groups']}}
       return types.SimpleNamespace(choices=[types.SimpleNamespace(message=types.SimpleNamespace(content=json.dumps(data)))])
     with F._fake_openai(Client),patch.object(T,'log'),patch.object(T,'emit'):
      result=T.llm_translate([(0,4,source)],F._TrArgs(translate_to=tl,translate_cache=False,translate_for_speech=speech),[],source_lang=sl,status_out=status)
     self.assertEqual(status['completed'],[0])
     self.assertEqual(status['failed'],[])
     self.assertEqual(result[0][2],target)
 def test_pipeline_rejects_bad_candidates_in_normal_and_speech_modes(self):
  for speech in (False,True):
   for source,target,sl,tl,issue in BAD:
    with self.subTest(speech=speech,source=source):
     status={}
     class Client:
      def __init__(self,**_):self.chat=types.SimpleNamespace(completions=self)
      def create(self,**kwargs):
       payload=json.loads(kwargs['messages'][-1]['content'])
       data={'items':{str(item['i']):target for item in payload['items']},'sentences':{str(g['ids'][0]):target for g in payload['sentence_groups']}}
       return types.SimpleNamespace(choices=[types.SimpleNamespace(message=types.SimpleNamespace(content=json.dumps(data)))])
     with F._fake_openai(Client),patch.object(T,'log'),patch.object(T,'emit'):
      result=T.llm_translate([(0,4,source)],F._TrArgs(translate_to=tl,translate_cache=False,translate_for_speech=speech,translate_lenient=speech),[],source_lang=sl,status_out=status)
     self.assertEqual(status['completed'],[])
     self.assertEqual(status['failed'],[0])
     self.assertTrue(result is None or result[0][2]==source)

if __name__=='__main__':unittest.main()
