"""The retired Tk entry must delegate to the shared Electron studio, never create old UI."""
import sys
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import patch, Mock
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools/voxcpm2'))
# Load only the real legacy constructor: no optional Tk/display runtime is needed.
import ast
ROOT=Path(__file__).resolve().parents[1]
source=ROOT/'tools/voxcpm2/text_studio_window.py'
original=next(n for n in ast.parse(source.read_text(encoding='utf-8')).body if isinstance(n,ast.ClassDef) and n.name=='Studio')
constructor=next(n for n in original.body if isinstance(n,ast.FunctionDef) and n.name=='__init__')
scope={'ROOT':ROOT}
exec(compile(ast.fix_missing_locations(ast.Module(body=[constructor],type_ignores=[])),str(source),'exec'),scope)
Studio=type('Studio',(),{'__init__':scope['__init__']})
class StudioLayout(unittest.TestCase):
 def test_legacy_overrides_are_explicitly_rejected_before_any_window(self):
  for kwargs in [{'args':SimpleNamespace()}, {'build_command':lambda *_:[]}]:
   with self.assertRaisesRegex(SystemExit,'retired.*ses-studyosu.bat'): Studio(**kwargs)

 def test_plain_entry_delegates_once_to_shared_studio_launcher(self):
  launcher=SimpleNamespace(main=Mock());spec=SimpleNamespace(loader=SimpleNamespace(exec_module=Mock()))
  with patch('importlib.util.spec_from_file_location',return_value=spec) as locate,patch('importlib.util.module_from_spec',return_value=launcher):
   window=Studio(); self.assertTrue(window._shared_studio)
   self.assertEqual(Path(locate.call_args.args[1]).name,'text_studio.py')
   spec.loader.exec_module.assert_called_once_with(launcher);launcher.main.assert_called_once_with()
if __name__=='__main__':unittest.main()
