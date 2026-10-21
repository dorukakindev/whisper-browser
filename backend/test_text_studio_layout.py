"""Construct the real Tk layout with disposable paths, without any model."""
import sys
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools/voxcpm2'))


class StudioLayout(unittest.TestCase):
    def test_controls_and_editor_fit_the_window(self):
        import tkinter as tk
        from text_studio_window import Studio
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            args = SimpleNamespace(config=root/'dub-settings.json', engine=root,
                                   reference=root/'voice.wav', transcript=root/'voice.txt', storage=root/'Sesler')
            try:
                window = Studio(args, lambda *_: [])
            except tk.TclError as error:
                if 'display' in str(error).lower(): self.skipTest(str(error))
                raise
            try:
                window.root.update(); window.root.update_idletasks()
                self.assertEqual(window.vars['mode'].get(), 'auto')
                self.assertEqual(window.vars['max_chars'].get(), '600')
                self.assertFalse(window.vars['align'].get())
                self.assertFalse(window.advanced_open.get())
                self.assertGreater(len(window.controls), 20)
                self.assertGreater(window.text.winfo_width(), 500)
                self.assertGreater(window.text.winfo_height(), 300)
                self.assertEqual(str(window.voice_list.cget('state')), 'readonly')
                window._locked(True); self.assertEqual(str(window.generate_button.cget('state')), 'disabled')
                window._locked(False); self.assertEqual(str(window.voice_list.cget('state')), 'readonly')
                body = 'Tam bir cümle. Devam eden ikinci cümle.'
                window.text.insert('1.0', body)
                window._count(); self.assertEqual(str(window.count_label.cget('text')), f'{len(body):,} karakter / characters')
                original_voice = window.vars['reference'].get()
                window.vars['mode'].set('clone')
                window.apply_preset('book')
                self.assertEqual(window.vars['max_chars'].get(), '900')
                self.assertEqual(window.vars['mode'].get(), 'clone')
                self.assertEqual(window.vars['reference'].get(), original_voice)
                self.assertEqual(window.text.get('1.0','end').strip(), body)
                window.vars['motor'].set('torch')
                self.assertEqual(str(window.temperature_control.cget('state')), 'disabled')
                window.apply_preset('balanced')
                self.assertEqual(window.vars['steps'].get(), '15')
                self.assertEqual(window.vars['max_chars'].get(), '600')
            finally:
                window.root.destroy()

if __name__ == '__main__': unittest.main()
