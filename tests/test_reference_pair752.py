"""Small contract checks for opt-in paired reference comparisons."""
import importlib.util
from pathlib import Path
from types import SimpleNamespace
import unittest
spec=importlib.util.spec_from_file_location('compare_prosody',Path(__file__).resolve().parents[1]/'tools/voxcpm2/compare_prosody.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)

class PairTests(unittest.TestCase):
    def args(self, **kwargs):
        return SimpleNamespace(only='single-context',alternate_reference=None,alternate_transcript=None,**kwargs)
    def test_existing_experiment_remains_unpaired(self):
        args=self.args();args.only='flowing'
        self.assertEqual(module.reference_pair(args),(None,None))
    def test_pair_requires_both_inputs(self):
        for key in ('alternate_reference','alternate_transcript'):
            args=self.args();setattr(args,key,Path('synthetic'))
            with self.assertRaisesRegex(ValueError,'Both'):module.reference_pair(args)
    def test_grouping_cannot_vary_with_reference(self):
        args=self.args();args.alternate_reference=Path('a.wav');args.alternate_transcript=Path('a.txt')
        self.assertEqual(module.reference_pair(args),(args.alternate_reference,args.alternate_transcript))
        args.only='flowing'
        with self.assertRaisesRegex(ValueError,'single-context'):module.reference_pair(args)

if __name__=='__main__':unittest.main()
