"""Exercise the actual CLI parser without importing or starting the GPU engine."""
import argparse
import ast
import contextlib
import io
import math
from pathlib import Path
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools/voxcpm2'))
node = next(n for n in ast.parse((ROOT / 'tools/voxcpm2/altyazi_oku.py').read_text(encoding='utf-8')).body
            if isinstance(n, ast.FunctionDef) and n.name == 'parse_args')
namespace = {'argparse': argparse, 'Path': Path, 'math': math}
exec(compile(ast.Module(body=[node], type_ignores=[]), 'production-cli', 'exec'), namespace)

class DurationArgumentTests(unittest.TestCase):
    def test_duration_is_optional_bounded_and_never_starts_the_model(self):
        with tempfile.TemporaryDirectory() as folder:
            source, reference = Path(folder)/'source.srt', Path(folder)/'reference.wav'
            source.write_text('test', encoding='utf-8'); reference.write_bytes(b'test')
            with patch.dict(sys.modules, {'kitap_voxcpm': SimpleNamespace(DEFAULT_REFERENCE=reference)}):
                args = [str(source), str(reference), '--mode', 'clone']
                self.assertIsNone(namespace['parse_args'](args).source_duration)
                self.assertEqual(namespace['parse_args'](args+['--source-duration', '19.014']).source_duration, 19.014)
                for value in ['0', '-1', 'nan', 'inf', '86401']:
                    with self.subTest(value=value), contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit):
                        namespace['parse_args'](args+['--source-duration', value])

if __name__ == '__main__':
    unittest.main()
