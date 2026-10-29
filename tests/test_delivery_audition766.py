import importlib.util,sys,tempfile,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools/voxcpm2'))
import compare_delivery as C
class DeliveryAuditionTests(unittest.TestCase):
 def test_short_source_and_complete_groups_are_required(self):
  with tempfile.TemporaryDirectory() as d:
   p=Path(d)/'sample.srt';p.write_text('\n\n'.join(f'{i+1}\n00:00:0{i*2},000 --> 00:00:0{i*2+1},000\nComplete sentence.' for i in range(3)),encoding='utf-8')
   self.assertEqual(len(C.bounded_groups(p,6)[1]),3)
   for duration in (0,2,121):
    with self.assertRaises(ValueError):C.bounded_groups(p,duration)
 def test_single_group_cannot_claim_automatic_delivery(self):
  with tempfile.TemporaryDirectory() as d:
   p=Path(d)/'sample.srt';p.write_text('1\n00:00:00,000 --> 00:00:01,000\nOnly one sentence.',encoding='utf-8')
   with self.assertRaises(ValueError):C.bounded_groups(p,3)
 def test_listening_page_has_source_neutral_labels_and_no_quality_winner(self):
  with tempfile.TemporaryDirectory() as d:
   C.write_listening_page(Path(d));page=(Path(d)/'listen.html').read_text(encoding='utf-8')
   self.assertEqual(page.count('<audio '),3);self.assertIn('<details>',page);self.assertNotIn('<details open',page);self.assertIn('#d5a35c',page);self.assertIn('varsayılanları değiştirilmedi',page)
if __name__=='__main__':unittest.main()
