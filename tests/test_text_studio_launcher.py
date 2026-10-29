"""Historical shortcuts must use the shared themed application, never Tk."""
import importlib.util
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('text_studio_launcher', Path(__file__).resolve().parents[1] / 'tools/voxcpm2/text_studio.py')
studio = importlib.util.module_from_spec(spec)
spec.loader.exec_module(studio)

class LauncherTests(unittest.TestCase):
    def test_windows_opens_shared_launcher_without_shell_interpolation(self):
        with patch.object(sys, 'argv', ['text_studio.py']), patch.object(studio.os, 'name', 'nt'), patch.object(studio.os, 'startfile', create=True) as launch:
            studio.main()
        launch.assert_called_once_with(str(studio.ROOT / 'ses-studyosu.bat'), cwd=str(studio.ROOT))

    def test_overrides_are_not_silently_discarded(self):
        with patch.object(sys, 'argv', ['text_studio.py', '--reference', 'voice.wav']), patch.object(studio.os, 'startfile', create=True) as launch:
            with self.assertRaisesRegex(SystemExit, 'not applied'):
                studio.main()
        launch.assert_not_called()

    def test_non_windows_has_explicit_application_route(self):
        with patch.object(sys, 'argv', ['text_studio.py']), patch.object(studio.os, 'name', 'posix'):
            with self.assertRaisesRegex(SystemExit, 'application'):
                studio.main()

if __name__ == '__main__':
    unittest.main()
