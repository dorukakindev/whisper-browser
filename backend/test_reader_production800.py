"""Exercise the actual recovery pipeline against a size-sensitive controlled provider."""
import json,sys,types,unittest,re
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).parent))
import test_transcribe as F
T=F.T
class SmallerRecovery(unittest.TestCase):
 def test_structural_batches_shrink_without_resending_completed_groups(self):
  calls=[];finished=set();duplicates=[];status={};broken_pair=[False]
  class Client:
   def __init__(self,**kwargs):self.chat=types.SimpleNamespace(completions=self)
   def create(self,**kwargs):
    p=json.loads(kwargs['messages'][-1]['content']);ids=[int(re.search(r'\d+',i['t']).group())-1 for i in p['items']];calls.append(ids)
    duplicates.extend(i for i in ids if i in finished)
    if len(ids)>2 or len(ids)==2 and ids[0]==0 and not broken_pair[0]:
     data={}
     if len(ids)==2:broken_pair[0]=True
    else:
     values={str(item['i']):'Sayı '+str(ids[pos]+1)+'.' for pos,item in enumerate(p['items'])};finished.update(ids)
     data={'items':values,'sentences':{str(g['ids'][0]):values[str(g['ids'][0])] for g in p['sentence_groups']}}
    return types.SimpleNamespace(choices=[types.SimpleNamespace(message=types.SimpleNamespace(content=json.dumps(data)),finish_reason='stop')])
  entries=[(i*5,i*5+4,'The number is '+str(i+1)+'.') for i in range(12)]
  with F._fake_openai(Client),patch.object(T,'log'),patch.object(T,'emit'):
   result=T.llm_translate(entries,F._TrArgs(translate_cache=False,translate_workers=1,translate_context=0),[],source_lang='en',status_out=status)
  self.assertIsNotNone(result,(calls,status));self.assertEqual(status['completed'],list(range(12)),(calls,status));self.assertEqual(status['failed'],[])
  sizes=[len(row) for row in calls];self.assertIn(6,sizes,sizes);self.assertIn(2,sizes,sizes);self.assertIn(1,sizes,sizes);self.assertEqual(duplicates,[])
if __name__=='__main__':unittest.main()
