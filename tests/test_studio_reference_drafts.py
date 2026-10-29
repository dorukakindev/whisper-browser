import importlib.util
from pathlib import Path
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

MODULE = Path(__file__).resolve().parents[1]/'tools/voxcpm2/text_studio_window.py'
spec = importlib.util.spec_from_file_location('studio_reference_test', MODULE)
studio = importlib.util.module_from_spec(spec)
try:
    spec.loader.exec_module(studio)
except ModuleNotFoundError as error:
    if error.name not in ('tkinter', '_tkinter'):
        raise
    studio = None


class Value:
    def __init__(self, text=''): self.text = text
    def get(self, *_): return self.text
    def set(self, text): self.text = text
    def delete(self, *_): self.text = ''
    def insert(self, _, text): self.text = text
    def configure(self, **_): pass


@unittest.skipIf(studio is None, 'Tkinter runtime is unavailable; Windows native acceptance is separate')
class ReferenceDraftTests(unittest.TestCase):
    def test_retired_constructor_cannot_open_unstyled_tk_window(self):
        with patch.object(studio.tk, 'Tk') as create_window:
            with self.assertRaisesRegex(SystemExit, 'not applied'):
                studio.Studio(SimpleNamespace(), lambda: None)
        create_window.assert_not_called()

    def test_parameterless_compatibility_entry_uses_shared_launcher(self):
        with patch.object(sys, 'argv', ['text_studio_window.py']), patch.object(studio.os, 'name', 'nt'), patch.object(studio.os, 'startfile', create=True) as launch, patch.object(studio.tk, 'Tk') as create_window:
            obj = studio.Studio()
            obj.run()
        launch.assert_called_once_with(str(studio.ROOT / 'ses-studyosu.bat'), cwd=str(studio.ROOT))
        create_window.assert_not_called()

    def test_voice_roundtrip_and_reselection_preserve_edits_without_writing_files(self):
        with tempfile.TemporaryDirectory() as folder:
            a, b = Path(folder)/'İlk ses.wav', Path(folder)/'İkinci ses.wav'
            for voice, text in [(a, 'İlk kayıt.'), (b, 'İkinci kayıt.')]:
                voice.write_bytes(b'fixture')
                voice.with_suffix('.txt').write_text(text, encoding='utf-8')
            obj = object.__new__(studio.Studio)
            obj.running = False; obj.reference_drafts = {}; obj.vars = {'reference':Value(str(a))}
            obj.transcript = Value('Düzeltilmiş ilk döküm.'); obj.reference_label = Value()
            obj._engine_controls = lambda: None
            obj._load = lambda file, widget: widget.insert('1.0', file.read_text(encoding='utf-8'))
            obj.set_reference(a)
            self.assertEqual(obj.transcript.get(), 'Düzeltilmiş ilk döküm.')
            obj.set_reference(b); self.assertEqual(obj.transcript.get(), 'İkinci kayıt.')
            obj.transcript.set('Düzeltilmiş ikinci döküm.')
            obj.set_reference(a); self.assertEqual(obj.transcript.get(), 'Düzeltilmiş ilk döküm.')
            obj.set_reference(b); self.assertEqual(obj.transcript.get(), 'Düzeltilmiş ikinci döküm.')
            self.assertEqual(a.with_suffix('.txt').read_text(encoding='utf-8'), 'İlk kayıt.')
            self.assertEqual(b.with_suffix('.txt').read_text(encoding='utf-8'), 'İkinci kayıt.')
            obj.running = True; obj.set_reference(a)
            self.assertEqual(obj.vars['reference'].get(), str(b))

    def test_refresh_discovers_shared_library_rename_without_changing_selection_or_draft(self):
        import json
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder); current=root/'current.wav'; current.write_bytes(b'fixture')
            library=root/'Ses referansları'/'record'; library.mkdir(parents=True)
            (library/'reference.wav').write_bytes(b'fixture')
            (library/'reference.json').write_text(json.dumps({'name':'Ortak ses'}), encoding='utf-8')
            obj=object.__new__(studio.Studio);obj.running=False;obj.args=SimpleNamespace(storage=root)
            obj.vars={'reference':Value(str(current)), 'engine':Value(str(root))}
            obj.transcript=Value('Unsaved draft.');obj.voice_list=Value();obj.status=Value()
            obj.refresh_references()
            self.assertIn('Ortak ses',obj.references)
            self.assertEqual(obj.vars['reference'].get(),str(current))
            self.assertEqual(obj.transcript.get(),'Unsaved draft.')
            (library/'reference.json').write_text(json.dumps({'name':'Yeni ortak ad'}),encoding='utf-8')
            obj.refresh_references();self.assertIn('Yeni ortak ad',obj.references)


if __name__ == '__main__':
    unittest.main()
