import copy
import importlib.util
from pathlib import Path
from types import SimpleNamespace
import unittest
ROOT=Path(__file__).resolve().parents[1]
def load(name):
    spec=importlib.util.spec_from_file_location(name,ROOT/'tools/voxcpm2'/f'{name}.py')
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module
prosody=load('compare_prosody');report=load('compare_step_results')
class StepComparisonTests(unittest.TestCase):
    def pair(self):
        a={'steps':10,'text_sha256':'text','reference_sha256':'reference','transcript_sha256':'transcript','model_revision':'revision','temperature':.8,'variants':[{'name':'single-context','cfg':1.65,'chunks':[{'text':'A complete sentence.','seed':42}]}]}
        b=copy.deepcopy(a);b['steps']=15;return a,b
    def test_existing_default_and_production_steps(self):
        self.assertEqual(prosody.comparison_steps(SimpleNamespace()),15)
        for value in (10,15):self.assertEqual(prosody.comparison_steps(SimpleNamespace(steps=value)),value)
        for value in (0,50,True,10.5):
            with self.assertRaises(ValueError):prosody.comparison_steps(SimpleNamespace(steps=value))
    def test_matching_inputs_are_required_not_just_different_step_labels(self):
        a,b=self.pair();self.assertEqual(len(report.matched_conditions(a,b)),2)
        for key in ('text_sha256','reference_sha256','transcript_sha256','model_revision','temperature'):
            changed=copy.deepcopy(b);changed[key]='different'
            with self.assertRaisesRegex(ValueError,'Unmatched'):report.matched_conditions(a,changed)
    def test_seed_grouping_and_cfg_cannot_change_under_a_step_comparison(self):
        a,b=self.pair()
        for field,value in [('seed',43),('text','Different sentence.')]:
            changed=copy.deepcopy(b);changed['variants'][0]['chunks'][0][field]=value
            with self.assertRaises(ValueError):report.matched_conditions(a,changed)
        b['variants'][0]['cfg']=2
        with self.assertRaisesRegex(ValueError,'CFG'):report.matched_conditions(a,b)
    def test_repeated_or_missing_steps_are_rejected(self):
        a,b=self.pair();b['steps']=10
        with self.assertRaises(ValueError):report.matched_conditions(a,b)
        del b['steps']
        with self.assertRaises(ValueError):report.matched_conditions(a,b)
if __name__=='__main__':unittest.main()
