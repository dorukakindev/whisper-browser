"""No model generation: validate the actual studio-to-reader argv contract."""
import importlib.util
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('text_studio', Path(__file__).resolve().parents[1] / 'tools/voxcpm2/text_studio.py')
studio = importlib.util.module_from_spec(spec)
spec.loader.exec_module(studio)

class StudioContract(unittest.TestCase):
    def test_reader_argv_paths_settings_and_validation(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp) / 'Ses Türkçe'; root.mkdir()
            python = root / '.venv/Scripts/python.exe'; python.parent.mkdir(parents=True); python.touch()
            (root / 'nanovllm_oku.py').touch()
            files = [root / name for name in ('referans.wav', 'döküm.txt', 'metin.txt')]
            for file in files: file.touch()
            files[1].write_text('Reference speech.', encoding='utf-8')
            settings = {'steps': 15, 'batch': 8, 'cfg': 1.65, 'temperature': .8, 'pause': .25}
            argv = studio.command(root, *files, root / 'çıktı.wav', settings)
            self.assertEqual(argv[0], str(python)); self.assertEqual(argv[argv.index('--mode')+1], 'hifi')
            self.assertEqual(argv[argv.index('--eszamanli')+1], '8')
            self.assertEqual(argv[argv.index('--max-chars')+1], '300')
            clone = studio.command(root, files[0], root/'absent.txt', files[2], root/'clone.wav', {**settings, 'mode':'clone', 'max_chars':900, 'preview':True,'preview_count':2,'normalize':False,'align':False})
            self.assertNotIn('--transcript', clone); self.assertIn('--no-align',clone); self.assertIn('--no-norm',clone)
            self.assertEqual(clone[clone.index('--limit')+1],'2')
            (root/'kitap_voxcpm.py').touch()
            torch = studio.command(root, *files, root/'torch.wav', {**settings,'motor':'torch'})
            self.assertTrue(torch[2].endswith('kitap_voxcpm.py')); self.assertNotIn('--temperature',torch);self.assertNotIn('--eszamanli',torch)
            self.assertEqual(argv[argv.index('--reference')+1] if '--reference' in argv else argv[4], str(files[0]))
            for key, value in [('steps', float('nan')), ('steps', 1.5), ('batch', 100), ('cfg', 0), ('temperature', float('inf')), ('pause', -1)]:
                with self.assertRaises(ValueError): studio.command(root, *files, root / 'output.wav', {**settings, key: value})
            files[0].unlink()
            with self.assertRaises(ValueError): studio.command(root, *files, root / 'output.wav', settings)

if __name__ == '__main__': unittest.main()
