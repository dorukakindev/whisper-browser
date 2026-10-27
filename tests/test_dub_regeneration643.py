import contextlib
import ast
import argparse
import hashlib
import io
import json
from pathlib import Path
import sys
import tempfile
import types
import unittest
import uuid
from unittest.mock import patch

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools'/'voxcpm2'))
from dub_regeneration import load_keys, select_keys
from dub_plan import read_source_bytes,parse_srt,make_groups
# Exercise the actual CLI/planning functions without importing the external
# GPU engine bootstrap (this test never synthesizes audio).
script=Path(__file__).resolve().parents[1]/'tools'/'voxcpm2'/'altyazi_oku.py'
functions=[n for n in ast.parse(script.read_text(encoding='utf-8')).body
           if isinstance(n,ast.FunctionDef) and n.name in ('parse_args','main')]
reader=types.ModuleType('controlled_reader_plan')
reader.__dict__.update(argparse=argparse,Path=Path,hashlib=hashlib,json=json,uuid=uuid,
                       read_source_bytes=read_source_bytes,parse_srt=parse_srt,make_groups=make_groups)
exec(compile(ast.Module(body=functions,type_ignores=[]),str(script),'exec'),reader.__dict__)


class RegenerationTests(unittest.TestCase):
    def test_file_selection_preserves_thousands_of_exact_keys_without_inline_argv(self):
        with tempfile.TemporaryDirectory() as folder:
            file=Path(folder)/'groups.json';keys=[str(i) for i in range(1,4001)]
            self.assertGreater(len(';'.join(keys)),12000)
            file.write_text(json.dumps(keys),encoding='utf-8')
            self.assertEqual(select_keys(load_keys('',file),keys),set(keys))
            with self.assertRaises(ValueError):load_keys('1',file)
            file.write_text(json.dumps([True]),encoding='utf-8')
            with self.assertRaises(ValueError):load_keys('',file)
            file.write_bytes(b' '*150001)
            with self.assertRaises(ValueError):load_keys('',file)
            with self.assertRaises(ValueError):select_keys({'3'},['1','2'])
            with self.assertRaises(ValueError):select_keys({'1'},['1','2'],True)

    def test_actual_plan_expands_force_all_only_after_range_selection(self):
        with tempfile.TemporaryDirectory() as folder:
            srt=Path(folder)/'source.srt';reference=Path(folder)/'reference.wav'
            srt.write_text('1\n00:00:00,000 --> 00:00:01,000\nFirst.\n\n2\n00:00:05,000 --> 00:00:06,000\nSecond.\n',encoding='utf-8');reference.write_bytes(b'fixture')
            captured=[];parse=reader.parse_args
            def remember(argv):
                args=parse(argv);captured.append(args);return args
            with patch.dict(sys.modules,{'kitap_voxcpm':types.SimpleNamespace(DEFAULT_REFERENCE=reference,resolve_prompt_text=lambda *a:'')}),patch.object(reader,'parse_args',remember),contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(reader.main([str(srt),str(reference),'--narration','--force-all','--range-start','4','--range-end','7','--plan']),0)
            self.assertEqual(captured[0].force_groups,{'2'})
            self.assertGreater(captured[0].regeneration_seed,0)


if __name__=='__main__':unittest.main()
