import unittest
import tempfile
from unittest.mock import patch
import speech_relations as R
import test_transcribe as F

SOURCE=[(0,3,"MARA: I lent Deniz my car, not my sister's."),(4,7,"DENIZ: Then I owe you an apology, not her.")]
WRONG=["MARA: Arabamı kız kardeşime değil, Deniz'e ödünç verdim.","DENIZ: Özür borçlu olan benim, o değil."]
RIGHT=["MARA: Deniz'e kız kardeşimin arabasını değil, kendi arabamı ödünç verdim.","DENIZ: Öyleyse ona değil, sana bir özür borçluyum."]

def facts(batch):
 return {'facts':[{'id':row['id'],'contrast_role':'owner',**{key:'source role' for key in R._FIELDS}} for row in batch['source_items']]}

class SourceRelationTests(unittest.TestCase):
 def test_source_only_bounded_batches_keep_all_risky_groups(self):
  payload={'sentence_groups':[{'ids':[i],'source':SOURCE[i%2][2],'translation':'PRIVATE DRAFT'} for i in range(25)],'neighbor_drafts':['PRIVATE']}
  batches=R.batches(payload,'en')
  self.assertEqual([row['id'] for batch in batches for row in batch['source_items']],list(range(25)))
  self.assertTrue(all(len(b['source_items'])<=12 for b in batches))
  self.assertNotIn('PRIVATE',str(batches))
  self.assertEqual(R.batches(payload,'tr'),[])
  self.assertEqual(R.batches({'sentence_groups':[{'ids':[0],'source':'The room is almost empty.'}]},'en'),[])
  with self.assertRaises(ValueError):R.batches({'sentence_groups':[{'ids':[0],'source':'not her '+'x'*6000}]},'en')
 def test_scene_boundaries_keep_pronoun_context_local(self):
  groups=[{'ids':[0],'source':'MARA speaks.','start':0,'end':2},
          {'ids':[1],'source':'I owe you, not her.','start':3,'end':5},
          {'ids':[2],'source':'An unrelated speaker arrives.','start':30,'end':32},
          {'ids':[3],'source':'I owe him, not you.','start':33,'end':35}]
  batch=R.batches({'sentence_groups':groups},'en')[0]
  self.assertEqual([r['scene'] for r in batch['source_items']],[0,1])
  self.assertEqual([(r['id'],r['scene']) for r in batch['context']],[(0,0),(2,1)])
 def test_response_cannot_rebind_ids_or_inject_unbounded_fields(self):
  batch=R.batches({'sentence_groups':[{'ids':[7],'source':SOURCE[0][2]}]},'en')[0]
  valid=facts(batch);self.assertEqual(R.validate(valid,batch)[0]['id'],7)
  for changed in [{'facts':[]},{'facts':[dict(valid['facts'][0],id=True)]},{'facts':[dict(valid['facts'][0],id=0)]},{'facts':[dict(valid['facts'][0],contrast_role='instruction')]},{'facts':[dict(valid['facts'][0],actor='x'*241)]},{'facts':[dict(valid['facts'][0],actor='bad\ncontrol')]}]:
   with self.subTest(data=changed):
    with self.assertRaises(ValueError):R.validate(changed,batch)
 def test_role_context_reaches_production_refiner_without_draft_leak(self):
  def answer(payload):
   if 'source_items' in payload:
    self.assertNotIn('neighbor_drafts',payload)
    for row in payload['source_items']:
     self.assertNotIn('tr',row);self.assertNotIn('translation',row)
    return facts(payload)
   parts=RIGHT if 'source_relations' in payload else WRONG
   return {'sentences':dict(enumerate(parts)),'items':dict(enumerate(parts))}
  result,calls,_,warnings=F._sentence_translate(SOURCE,F._TrArgs(translate_for_speech=True,translate_cache=False),answer)
  self.assertEqual([row[2] for row in result],RIGHT)
  self.assertEqual([row[:2] for row in result],[row[:2] for row in SOURCE])
  self.assertEqual(sum('source_items' in payload for payload,_ in calls),1)
  self.assertTrue(any('source_relations' in payload for payload,_ in calls))
  self.assertEqual(warnings,[])
 def test_only_risky_group_draft_is_removed_without_mutating_stored_output(self):
  payload={'items':[{'i':0,'src':SOURCE[0][2],'tr':WRONG[0]},{'i':1,'src':'Hello.','tr':'Merhaba.'}],
           'sentence_groups':[{'ids':[0],'source':SOURCE[0][2],'translation':WRONG[0]},
                              {'ids':[1],'source':'Hello.','translation':'Merhaba.'}]}
  batch=R.batches(payload,'en')[0];R.apply_to_review(payload,R.validate(facts(batch),batch))
  self.assertNotIn('tr',payload['items'][0]);self.assertNotIn('translation',payload['sentence_groups'][0])
  self.assertEqual(payload['items'][1]['tr'],'Merhaba.')
  self.assertEqual(payload['items'][0]['review_mode'],'source_retranslation')
 def test_failed_relation_reading_keeps_valid_existing_draft(self):
  def answer(payload):
   if 'source_items' in payload:raise RuntimeError('isolated provider failure')
   return {'sentences':dict(enumerate(WRONG)),'items':dict(enumerate(WRONG))}
  result,_,_,warnings=F._sentence_translate(SOURCE,F._TrArgs(translate_for_speech=True,translate_cache=False),answer)
  self.assertEqual([row[2] for row in result],WRONG)
  self.assertTrue(any('Source role review unavailable' in w for w in warnings))
 def test_failed_role_context_is_retried_from_cache_without_retranslation(self):
  def unavailable(payload):
   if 'source_items' in payload:raise RuntimeError('isolated role failure')
   return {'sentences':dict(enumerate(WRONG)),'items':dict(enumerate(WRONG))}
  def available(payload):
   if 'source_items' in payload:return facts(payload)
   return {'sentences':dict(enumerate(RIGHT)),'items':dict(enumerate(RIGHT))}
  with tempfile.TemporaryDirectory() as root:
   args=F._TrArgs(translate_for_speech=True,translate_cache=True,cache_dir=root)
   F._sentence_translate(SOURCE,args,unavailable)
   result,calls,_,_=F._sentence_translate(SOURCE,args,available)
   self.assertEqual([row[2] for row in result],RIGHT)
   self.assertFalse(any('items' in payload and 't' in payload['items'][0] for payload,_ in calls))
   self.assertTrue(any('source_items' in payload for payload,_ in calls))
   _,third,_,_=F._sentence_translate(SOURCE,args,available)
   self.assertEqual(third,[])
 def test_cancellation_during_role_request_is_not_suppressed(self):
  class Cancelled(BaseException):pass
  def answer(payload):
   if 'source_items' in payload:raise Cancelled()
   return {'sentences':dict(enumerate(WRONG)),'items':dict(enumerate(WRONG))}
  with self.assertRaises(Cancelled):
   F._sentence_translate(SOURCE,F._TrArgs(translate_for_speech=True,translate_cache=False),answer)
 def test_source_retranslation_keeps_user_glossary_and_scene_context(self):
  def answer(payload):
   if 'source_items' in payload:return facts(payload)
   return {'sentences':dict(enumerate(RIGHT)),'items':dict(enumerate(RIGHT))}
  args=F._TrArgs(translate_for_speech=True,translate_cache=False,glossary='Deniz')
  args.scene_context={'note':'Two people talking.'}
  _,calls,_,_=F._sentence_translate(SOURCE,args,answer)
  reviewed=[(p,k) for p,k in calls if 'source_relations' in p]
  self.assertTrue(reviewed)
  payload,request=reviewed[0]
  self.assertIn('Deniz',request['messages'][0]['content'])
  for rule in F.T.SPEECH_READALOUD_RULES:
   self.assertIn(rule,request['messages'][0]['content'])
  self.assertIn('Translate the supplied source dialogue',request['messages'][0]['content'])
  for rule in F.T.TURKISH_NATIVE_REFINE_RULES[:-1]:
   self.assertIn(rule,request['messages'][0]['content'])
  self.assertNotIn('yalnizca gercek hatalari duzelteceksin',request['messages'][0]['content'])
  self.assertIn('Use contrast_role',request['messages'][0]['content'])
  self.assertEqual(payload['scene_notes'],args.scene_context)
  self.assertIn('untrusted context',request['messages'][0]['content'])
 def test_ordinary_translation_has_no_extra_role_request(self):
  def answer(payload):return {'sentences':dict(enumerate(RIGHT)),'items':dict(enumerate(RIGHT))}
  _,calls,_,_=F._sentence_translate(SOURCE,F._TrArgs(translate_for_speech=False,translate_refine=True,translate_cache=False),answer)
  self.assertFalse(any('source_items' in payload or 'source_relations' in payload for payload,_ in calls))

if __name__=='__main__':unittest.main()
