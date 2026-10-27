import sys,unittest
from pathlib import Path
import numpy as np
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'backend'))
from music_tags import scores,CATEGORIES,ASSETS
class Tags(unittest.TestCase):
 def test_scores_are_cosines_not_probabilities(self):
  a=np.eye(1,512,0)[0];b=np.eye(1,512,1)[0]
  x=scores([a.tolist()],[a.tolist(),b.tolist(),(-a).tolist()]);np.testing.assert_allclose(x,[[1,0,-1]])
 def test_invalid_vectors_are_rejected(self):
  for audio,text in [([[0]*512],[[1]*512]),([[1]*512],[[0]*512]),([[1]*512],[[1]*3]),([[1]*512],[[float('nan')]*512])]:
   with self.assertRaises(ValueError):scores(audio,text)
 def test_fixed_scope_and_pinned_small_assets(self):
  self.assertEqual(set(CATEGORIES),{'genre','mood','instrument','voice'});self.assertEqual(len(ASSETS),3)
  self.assertTrue(all(size<3000000 and len(sha)==64 for size,sha in ASSETS.values()))
if __name__=='__main__':unittest.main()
