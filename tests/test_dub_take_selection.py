from pathlib import Path
import hashlib,json,sys,tempfile,unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools/voxcpm2'))
from dub_take_selection import selected_paths
class SelectionTests(unittest.TestCase):
 def test_exact_recipe_selection_preserves_review_and_other_groups(self):
  with tempfile.TemporaryDirectory() as d:
   root=Path(d);archive=root/'_dub_takes_v1';archive.mkdir();body=b'saved wave';sha=hashlib.sha256(body).hexdigest();take=archive/(sha+'.wav');take.write_bytes(body)
   slots=[root/('a'*64+'.wav'),root/('b'*64+'.wav')];record={'text':'Spoken words.','status':'review','verification':{'status':'review'}}
   request=root/'selected.json';doc={'2':{'cache_key':slots[1].stem,'sha256':sha,'record':record}};request.write_text(json.dumps(doc),encoding='utf-8')
   paths,records=selected_paths(request,slots,['1','2'],set(),root/'output.wav',lambda _:True)
   self.assertEqual(paths,[slots[0],take]);self.assertEqual(records['2']['status'],'review');self.assertEqual(slots[1].stem,'b'*64)
   with self.assertRaises(ValueError):selected_paths(request,slots,['1','2'],{'2'},root/'output.wav',lambda _:True)
   doc['2']['cache_key']='c'*64;request.write_text(json.dumps(doc),encoding='utf-8')
   with self.assertRaisesRegex(ValueError,'different text'):selected_paths(request,slots,['1','2'],set(),root/'output.wav',lambda _:True)
   doc['2']['cache_key']=slots[1].stem;request.write_text(json.dumps(doc),encoding='utf-8');take.write_bytes(b'changed')
   with self.assertRaisesRegex(ValueError,'changed'):selected_paths(request,slots,['1','2'],set(),root/'output.wav',lambda _:True)
if __name__=='__main__':unittest.main()
