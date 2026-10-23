"""Bulk regeneration files stay bounded and are safe for Windows argv."""
import json
from pathlib import Path
import sys
import tempfile
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools/voxcpm2'))
from dub_requests import force_group_keys


class Regeneration529(unittest.TestCase):
    def test_selection_combines_legacy_single_key_and_bom_file_without_duplicates(self):
        with tempfile.TemporaryDirectory() as folder:
            file=Path(folder)/'Türkçe seçim.json';file.write_text(json.dumps(['1,2','3','3']),encoding='utf-8-sig')
            self.assertEqual(force_group_keys('4;1,2',file),{'1,2','3','4'})
            self.assertEqual(force_group_keys(),set())

    def test_invalid_or_oversized_requests_fail_before_generation(self):
        with tempfile.TemporaryDirectory() as folder:
            file=Path(folder)/'groups.json'
            for value in ({},None,[None],['../1'],[''],[True],['1']*5001,['1'*2001]):
                file.write_text(json.dumps(value))
                with self.subTest(value=str(value)[:50]),self.assertRaises(ValueError):force_group_keys(file=file)
            file.write_bytes(b' '*100001)
            with self.assertRaisesRegex(ValueError,'too large'):force_group_keys(file=file)
            file.write_bytes(b'{bad JSON')
            with self.assertRaises(ValueError):force_group_keys(file=file)

    def test_many_valid_keys_are_read_from_a_file_without_becoming_an_argv_string(self):
        with tempfile.TemporaryDirectory() as folder:
            file=Path(folder)/'groups.json';keys=[str(n) for n in range(1,5001)]
            file.write_text(json.dumps(keys),encoding='utf-8')
            self.assertEqual(force_group_keys(file=file),set(keys))

if __name__=='__main__':unittest.main()
