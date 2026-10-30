import ast
import os
from pathlib import Path
import sys
import unittest
import numpy as np
ROOT=Path(__file__).resolve().parents[1]
BASE=Path(os.environ.get('REPORT495_BASE',ROOT))
VOICE=BASE/'voxcpm2' if os.environ.get('REPORT495_BASE') else BASE/'tools'/'voxcpm2'
sys.path.insert(0,str(VOICE))
import dub_quality as Q
SOURCE=(VOICE/'altyazi_oku.py').read_text(encoding='utf-8')
class Report495(unittest.TestCase):
 def test_16_introduced_negation_is_reviewed(self):
  expected='We will arrive at the station tomorrow with all of our friends and their bags'
  self.assertTrue(Q.speech_check(expected,expected.replace('will arrive','will not arrive'))['review'])
  self.assertFalse(Q.speech_check('I cannot leave here today','I can not leave here today')['added_negation'])
 def test_17_changed_unit_is_reviewed(self):
  expected='Bu yol boyunca her gün düzenli olarak tam 12 kilometre ilerleyip sonra eve dönüyoruz'
  self.assertTrue(Q.speech_check(expected,expected.replace('kilometre','kilogram'))['review'])
 def test_18_repeated_phrase_is_reviewed(self):
  expected='Bu güzel şehirde her sabah birlikte yürüyüş yapıyoruz ve sonra eve dönüp kahvaltı hazırlıyoruz'
  self.assertTrue(Q.speech_check(expected,expected.replace('birlikte yürüyüş yapıyoruz','birlikte yürüyüş yapıyoruz birlikte yürüyüş yapıyoruz'))['review'])
 def test_19_clipped_final_audio_is_never_ready(self):
  tree=ast.parse(SOURCE)
  node=next(n for n in ast.walk(tree) if isinstance(n,ast.For) and isinstance(n.target,ast.Tuple)
            and [getattr(x,'id','') for x in n.target.elts]==['i','row'] and 'timing_row' in ast.unparse(n))
  row={'status':'ready'}
  scope=dict(public_groups=[row],timing={'groups':[{'start_seconds':0,'after_seconds':1,'cut_frames':10}]},
   groups=[{'text':'Speech','start':0,'end':1000}],cues=[(0,1000,'Speech')],timeline=np.zeros(16000),sr=16000,
   active_ranges=lambda *a:[],apply_timing_quality=getattr(Q,'apply_timing_quality',lambda *a:None))
  exec(compile(ast.Module(body=[node],type_ignores=[]),'quality','exec'),scope)
  self.assertEqual(row['status'],'review')
 def test_20_unavailable_requested_verification_is_not_ready(self):
  node=next(n for n in ast.walk(ast.parse(SOURCE)) if isinstance(n,ast.Expr) and isinstance(n.value,ast.Call)
   and isinstance(n.value.func,ast.Attribute) and n.value.func.attr=='update'
   and {'verification','final_seconds','status'} <= {k.arg for k in n.value.keywords})
  metric={'quality_score':0};scope=dict(delivery=None,metric=metric,check={'status':'unavailable'},text='Nyutin',display_speech='Newton',editable_text='Newton',wav=[0],sr=1,
   generation_status=getattr(Q,'generation_status',lambda score,check:'ready'))
  exec(compile(ast.Module(body=[node],type_ignores=[]),'status','exec'),scope)
  self.assertEqual(metric['status'],'review')
  self.assertEqual(metric['text'],'Newton')
  self.assertEqual(metric['pronunciationText'],'Nyutin')
if __name__=='__main__':unittest.main()
