import sys, unittest, re, pathlib
from unittest.mock import patch
sys.path.insert(0,str(pathlib.Path(__file__).parent))
import sentence_translation as S
import transcribe as T
class Audit611(unittest.TestCase):
 def test_correct_localizations_and_real_losses(self):
  good=[("Honestly I'm tired.",'Açıkçası yorgunum.','tr','en'),("Don't open the door!",'Kapıyı açma!','tr','en'),("Ahmet's car is here.","Ahmet'in arabası burada.",'tr','en'),('It weighs 0.500 kg.','0,5 kg ağırlığında.','tr','en'),('It weighs 0.500 kg.','500 gram ağırlığında.','tr','en'),('See you at 5:30 p.m.','Nous nous voyons à 17h30.','fr','en'),('See you at 5:30 p.m.',"Akşam 5.30'da görüşürüz.",'tr','en'),('It is -5 degrees outside.','Dışarıda eksi 5 derece.','tr','en'),('We lost 3-1.','3-1 kaybettik.','tr','en'),('Call 555-0134.',"555-0134'ü ara.",'tr','en'),('5 kişi geldi.','Five people came.','en','tr'),("Saat 17.30'da görüşelim.", 'See you at 5:30 p.m.','en','tr'),('2.5 million people.','2,5 milyon kişi.','tr','en')]
  for a,b,tl,sl in good:
   with self.subTest(source=a):
    self.assertEqual(S.translation_blocking_issues(a,b,tl,sl),[])
    self.assertFalse(S.part_anchor_issue([a],[b],tl,sl))
  bad=[('I like it.','Bunu sevmiyorum.','tr','en'),('I did not eat the apple.','Elma yedim.','tr','en'),('I did not get into the car.','Arabama bindim.','tr','en'),('It is -5 degrees.','5 derece.','tr','en'),('We lost 3-1.','1-3 kaybettik.','tr','en'),('Gelmek zorundasın.','You can come.','en','tr'),('Beş kişi geldi.','Ten people came.','en','tr')]
  for a,b,tl,sl in bad:
   with self.subTest(source=a):self.assertTrue(S.translation_blocking_issues(a,b,tl,sl))
  self.assertTrue(S.part_anchor_issue(["Ahmet's car is here."],["Mehmet'in arabası burada."],'tr','en'))
 def test_cancelled_response_is_not_accepted(self):
  cancelled=[]
  def checkpoint(*args):
   if cancelled: raise T.PipelineCancelled('llm','after')
  def response():
   cancelled.append(True);return 'late response'
  with patch.object(T,'cancellation_checkpoint',side_effect=checkpoint):
   with self.assertRaises(T.PipelineCancelled):T.call_api_with_retry(response)
 def test_closing_tags_keep_sentence_breaks_inside(self):
  self.assertEqual(S.insert_sentence_breaks('At 5:30 p.m.'), 'At 5:30 p.m.')
  S.set_target_language('en')
  self.assertFalse(S.sentence_part_boundary_issue(["Saat 17.30’da görüşelim."],['See you at 5:30 p.m.'],'tr'))
  S.set_target_language('tr')
  for a in ['<i>Dur. Burada bekle.</i>','♪ Dur. Burada bekle. ♪']:
   b=S.insert_sentence_breaks(a)
   self.assertNotRegex(b,r'\n(?:</i>|♪)$');self.assertEqual(re.sub(r'\s+',' ',b),a)
 def test_zero_length_word_at_accepted_end_is_not_lost(self):
  word={'start':2,'end':2,'word':'end'}
  self.assertEqual(T.words_in_accepted_ranges([word],[(0,2)]),[word])
  self.assertEqual(T.words_in_accepted_ranges([word],[(0,1.9998)]),[word])
 def test_spaceless_wrap_keeps_every_character(self):
  for text in ['日本語の長い文章です。'*12,'ภาษาไทยทดสอบ'*12]:
   result=T.wrap_text(text,20,wrap_mode='balanced')
   self.assertEqual(result.replace('\n',''),text);self.assertIn('\n',result)
   self.assertEqual(T.wrap_text(result,20,wrap_mode='balanced'),result)
 def test_speech_omission_warning_distinguishes_faithful_control(self):
  sources=[(0,3,'We originally believed that the evidence would support this conclusion, but it did not.'),(4,7,'First, mix the flour. Then add the eggs. Finally, bake it.')]
  self.assertEqual(T.speech_coverage_indices(sources,['Kanıtlar desteklemedi.','Unu karıştırın.']),[0,1])
  self.assertEqual(T.speech_coverage_indices(sources,['Başlangıçta kanıtların bu sonucu destekleyeceğine inanıyorduk ama desteklemedi.','Önce unu karıştırın, sonra yumurtaları ekleyin ve son olarak pişirin.']),[])
 def test_shared_gate_corpus(self):
  import json
  rows=json.loads((pathlib.Path(__file__).parent/'testdata/translation_gate_shared611.json').read_text('utf-8-sig'))
  for row in rows:
   with self.subTest(source=row['source']):
    self.assertEqual(not S.translation_blocking_issues(row['source'],row['target'],'tr','en'),row['accept'])
 def test_ass_coordinates_use_original_canvas(self):
  document='[Script Info]\nPlayResX: 1280\nPlayResY: 720\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:00:01.00,0:00:02.00,Default,,0,0,0,,{\\pos(640,60)}Hello\n'
  self.assertEqual(T.parse_ass_cue_formats(document)[0]['pos'],('960','90'))
 def test_cancel_before_first_request(self):
  called=[]
  with patch.object(T,'cancellation_checkpoint',side_effect=T.PipelineCancelled('translate','before_attempt')):
   with self.assertRaises(T.PipelineCancelled):T.call_api_with_retry(lambda:called.append(1))
  self.assertEqual(called,[])
if __name__=='__main__':unittest.main(verbosity=2)
