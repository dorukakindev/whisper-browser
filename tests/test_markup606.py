import sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path('backend').resolve()))
from sentence_translation import translation_blocking_issues,markup_preserved
class Markup606(unittest.TestCase):
 def test_order_count_and_ass(self):
  for a,b in [('<i>Hello</i>','<i>Merhaba</i>'),('{\\an8}Hello','{\\an8}Merhaba'),('♪Sing♪','♪Şarkı♪')]:self.assertTrue(markup_preserved(a,b))
  for b in ['Merhaba','</i>Merhaba<i>','<i>Merhaba</i></i>']:
   self.assertIn('markup_mismatch',translation_blocking_issues('<i>Hello</i>',b,'tr'))
if __name__=='__main__':unittest.main()
