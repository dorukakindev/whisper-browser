import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

import transcribe


class MediaFolderTests(unittest.TestCase):
    def test_default_input_and_output_folders_are_separate(self):
        home = Path("C:/Users/Test")
        args = SimpleNamespace(input_dir=None, output_dir=None, input="D:/video.mkv")
        with mock.patch.object(transcribe.Path, "home", return_value=home):
            self.assertEqual(
                transcribe.resolve_input_dir(args),
                home / "Downloads" / "Whisper" / "GİRDİ",
            )
            self.assertEqual(
                transcribe.resolve_output_dir(args),
                home / "Downloads" / "Whisper" / "ÇIKTI",
            )

    def test_explicit_folders_are_preserved(self):
        args = SimpleNamespace(input_dir="D:/Girdi", output_dir="E:/Cikti")
        self.assertEqual(transcribe.resolve_input_dir(args), Path("D:/Girdi"))
        self.assertEqual(transcribe.resolve_output_dir(args), Path("E:/Cikti"))

    def test_input_preflight_creates_and_cleans_probe(self):
        with tempfile.TemporaryDirectory() as root:
            target = Path(root) / "GİRDİ"
            self.assertEqual(transcribe.preflight_input_dir(target), target)
            self.assertTrue(target.is_dir())
            self.assertEqual(list(target.iterdir()), [])


if __name__ == "__main__":
    unittest.main()
