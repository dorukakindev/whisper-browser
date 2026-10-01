"""R371 — probe_duration ffprobe çözümleme kilitleri.

B-371-01: Linux'ta ffmpeg'in yanında duran uzantısız `ffprobe` master'da
bulunamıyordu; yalnız `ffprobe.exe` aranıyordu ve PATH boşsa süre ölçümü
sessizce None'a düşüyordu. Platformdan bağımsız iki ad da denenir.
"""

import os
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import transcribe


class ProbeResolutionLocks(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.dir = Path(self._tmp.name)
        ffmpeg = self.dir / "ffmpeg"
        ffmpeg.write_text("#!/bin/sh\n", encoding="utf-8")
        self.ffmpeg = str(ffmpeg)
        self.media = self.dir / "v.mp4"
        self.media.write_bytes(b"x")
        # PATH'i izole et: shutil.which yedeğine düşmesin.
        self._orig_path = os.environ.get("PATH", "")
        os.environ["PATH"] = tempfile.mkdtemp()
        self.addCleanup(lambda: os.environ.__setitem__("PATH", self._orig_path))

    def _fake_ffprobe(self, name, payload=b"#!/bin/sh\necho 42.5\n"):
        probe = self.dir / name
        probe.write_bytes(payload)
        probe.chmod(0o755)
        return probe

    def test_extensionless_sibling_ffprobe_is_found(self):
        self._fake_ffprobe("ffprobe")
        if os.name == "nt":
            # Windows CreateProcess uzantısız dosyayı çalıştırmaz → temiz None.
            self.assertIsNone(transcribe.probe_duration(str(self.media), self.ffmpeg))
        else:
            self.assertEqual(transcribe.probe_duration(str(self.media), self.ffmpeg), 42.5)

    def test_exe_sibling_still_works(self):
        # Windows düzeni: yalnız .exe adı var. Windows'ta CreateProcess .exe
        # dosyasını çalıştırır; POSIX'te shebang + x-bit uzantıya bakmaz.
        # İki platformda da yürütülebilir dosya bulunur.
        self._fake_ffprobe("ffprobe.exe")
        if os.name == "nt":
            # sh-betiği geçerli bir PE değil → WinError 193 → temiz None.
            self.assertIsNone(transcribe.probe_duration(str(self.media), self.ffmpeg))
        else:
            self.assertEqual(transcribe.probe_duration(str(self.media), self.ffmpeg), 42.5)

    def test_missing_probe_returns_none(self):
        self.assertIsNone(transcribe.probe_duration(str(self.media), self.ffmpeg))

    def test_probe_failure_returns_none(self):
        # ffprobe bulunur ama dosya hatası verir (bozuk/eksik medya) → None.
        self._fake_ffprobe("ffprobe", payload=b"#!/bin/sh\nexit 1\n")
        self.assertIsNone(transcribe.probe_duration(str(self.dir / "yok.mp4"), self.ffmpeg))

    def test_garbage_output_returns_none(self):
        self._fake_ffprobe("ffprobe", payload=b"#!/bin/sh\necho not-a-number\n")
        self.assertIsNone(transcribe.probe_duration(str(self.media), self.ffmpeg))


if __name__ == "__main__":
    unittest.main()
