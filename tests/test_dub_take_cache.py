import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec=importlib.util.spec_from_file_location('take_cache',Path(__file__).resolve().parents[1]/'tools/voxcpm2/dub_take_cache.py')
takes=importlib.util.module_from_spec(spec);spec.loader.exec_module(takes)

class TakeTests(unittest.TestCase):
    def test_regeneration_cannot_change_a_previous_manifest_take(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);source=root/"İlk ses 'parça'.wav";store=root/'takes'
            source.write_bytes(b'first independent raw speech')
            first=takes.snapshot(source,store)
            source.write_bytes(b'new regenerated raw speech')
            second=takes.snapshot(source,store)
            self.assertEqual(Path(first['file']).read_bytes(),b'first independent raw speech')
            self.assertEqual(Path(second['file']).read_bytes(),source.read_bytes())
            self.assertNotEqual(first['sha256'],second['sha256'])
            self.assertEqual(takes.snapshot(source,store),second)
            self.assertEqual(len(list(store.glob('*.wav'))),2)
            self.assertFalse(list(store.glob('*.partial')))

    def test_corrupt_archive_is_never_overwritten_or_trusted(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);source=root/'cache.wav';store=root/'takes';source.write_bytes(b'valid source')
            first=takes.snapshot(source,store);Path(first['file']).write_bytes(b'changed archive')
            with self.assertRaisesRegex(ValueError,'identity'):takes.snapshot(source,store)
            self.assertEqual(Path(first['file']).read_bytes(),b'changed archive')
            self.assertEqual(source.read_bytes(),b'valid source')
            self.assertFalse(list(store.glob('*.partial')))

    def test_optional_storage_failure_keeps_voice_but_never_claims_mutable_path(self):
        warnings=[]
        with patch.object(takes,'snapshot',side_effect=PermissionError('synthetic disk refusal')):
            result=takes.capture([Path('live.wav')],Path('takes'),lambda _:True,warnings.append)
        self.assertEqual(result,[{'file':'','takeUnavailable':True}])
        self.assertEqual(warnings,['DUB_WARNING take_snapshot_unavailable'])
        self.assertEqual(takes.capture([Path('failed.wav')],Path('takes'),lambda _:False),result)
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);source=root/'live.wav';source.write_bytes(b'keep this source')
            with patch.object(takes.os,'link',side_effect=PermissionError('synthetic install refusal')):
                failed=takes.capture([source],root/'takes',lambda _:True,warnings.append)
            self.assertEqual(failed,result)
            self.assertEqual(source.read_bytes(),b'keep this source')
            self.assertFalse(list((root/'takes').iterdir()))


if __name__=='__main__':unittest.main()
