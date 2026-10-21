import sys
import unittest
from pathlib import Path

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools/voxcpm2'))
from dub_expression import synthesis_text


class ExpressionTests(unittest.TestCase):
    def test_reference_is_unchanged_and_style_never_edits_spoken_words(self):
        text='Bugün güzel bir gün; başlayalım mı?'
        self.assertEqual(synthesis_text(text),text)
        for style in ('calm','warm','lively'):
            value=synthesis_text(text,style)
            self.assertTrue(value.startswith('('))
            self.assertEqual(value.split(') ',1)[1],text)
        with self.assertRaises(ValueError): synthesis_text(text,'arbitrary')


if __name__=='__main__': unittest.main()
