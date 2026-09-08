import os
import shutil
import sys
import tempfile
import types
import unittest
from pathlib import Path

import media as M


class FakeYdl:
    info = None
    captured_options = None

    def __init__(self, options):
        type(self).captured_options = options

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def extract_info(self, _url, download=True):
        return type(self).info


class MediaIoTests(unittest.TestCase):
    def setUp(self):
        self.temp = Path(tempfile.mkdtemp(prefix="whisper-media-io-"))
        self.old_module = sys.modules.get("yt_dlp")
        sys.modules["yt_dlp"] = types.SimpleNamespace(YoutubeDL=FakeYdl)
        self.old_emit = M.emit
        self.events = []
        M.emit = lambda event_type, **kwargs: self.events.append({"type": event_type, **kwargs})

    def tearDown(self):
        M.emit = self.old_emit
        if self.old_module is None:
            sys.modules.pop("yt_dlp", None)
        else:
            sys.modules["yt_dlp"] = self.old_module
        shutil.rmtree(self.temp, ignore_errors=True)

    def test_audio_language_cannot_inject_format_selector(self):
        with self.assertRaisesRegex(ValueError, "ses dili"):
            M.download("https://example.test/video", 1080, "en]+bestvideo", self.temp)

    def test_empty_info_is_explicit_failure(self):
        FakeYdl.info = None
        with self.assertRaisesRegex(RuntimeError, "boş sonuç"):
            M.download("https://example.test/video", 1080, "", self.temp)

    def test_unrelated_existing_mp4_is_not_mistaken_for_download(self):
        (self.temp / "Same title but unrelated.mp4").write_bytes(b"old")
        FakeYdl.info = {"id": "wanted", "title": "Same title", "requested_downloads": []}
        with self.assertRaisesRegex(RuntimeError, "bulunamadı"):
            M.download("https://example.test/video", 1080, "", self.temp)

    def test_requested_download_outside_output_directory_is_rejected(self):
        outside = self.temp.parent / "outside-video.mp4"
        outside.write_bytes(b"outside")
        self.addCleanup(lambda: outside.unlink(missing_ok=True))
        FakeYdl.info = {
            "id": "wanted", "title": "Video",
            "requested_downloads": [{"filepath": str(outside)}],
        }
        with self.assertRaisesRegex(RuntimeError, "bulunamadı"):
            M.download("https://example.test/video", 1080, "", self.temp)

    def test_valid_requested_download_is_emitted_as_resolved_path(self):
        output = self.temp / "Video [wanted].mp4"
        output.write_bytes(b"valid")
        FakeYdl.info = {
            "id": "wanted", "title": "Video", "duration": 12,
            "requested_downloads": [{"filepath": str(output)}],
        }
        M.download("https://example.test/video", 1080, "tr", self.temp)
        downloaded = [event for event in self.events if event["type"] == "downloaded"]
        self.assertEqual(downloaded[-1]["path"], str(output.resolve()))
        self.assertTrue(FakeYdl.captured_options["noplaylist"])

    def test_broken_and_old_local_ffmpeg_are_skipped(self):
        candidate = self.temp / "bin" / "ffmpeg.exe"
        candidate.parent.mkdir()
        candidate.write_bytes(b"broken")
        original_file = M.__file__
        original_run = M.subprocess.run
        try:
            M.__file__ = str(self.temp / "backend" / "media.py")
            M.subprocess.run = lambda *_args, **_kwargs: types.SimpleNamespace(
                returncode=1, stdout="", stderr="broken"
            )
            self.assertIsNone(M._find_ffmpeg())
            M.subprocess.run = lambda *_args, **_kwargs: types.SimpleNamespace(
                returncode=0, stdout="ffmpeg version 3.4", stderr=""
            )
            self.assertIsNone(M._find_ffmpeg())
        finally:
            M.__file__ = original_file
            M.subprocess.run = original_run


if __name__ == "__main__":
    unittest.main(verbosity=2)
