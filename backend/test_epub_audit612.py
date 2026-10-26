import sys,pathlib,unittest
sys.path.insert(0,str(pathlib.Path(__file__).parent))
from media_shelf import Prose
class ProseAudit612(unittest.TestCase):
 def test_metadata_navigation_and_empty_body(self):
  p=Prose();p.feed('<html><head><title>Do not narrate</title><meta/></head><body><nav>Contents</nav><div></div></body></html>');self.assertEqual(p.value(),'')
 def test_body_blocks_are_separate_and_notes_remain_explicit(self):
  p=Prose();p.feed('<body><h4>Heading</h4><blockquote>Quote</blockquote><table><tr><td>Cell A</td><td>Cell B</td></tr></table><p>Prose.<a epub:type="noteref">1</a> More.</p><aside epub:type="footnote"><p>Footnote retained.</p></aside></body>')
  self.assertEqual(p.value(),'Heading\n\nQuote\n\nCell A\n\nCell B\n\nProse. More.\n\nFootnote retained.')
if __name__=='__main__':unittest.main(verbosity=2)
