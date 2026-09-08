import shutil
import subprocess
import tempfile
import unittest
import wave
from pathlib import Path

import transcribe as T


class RealFfmpegIoTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.ffmpeg = T.find_ffmpeg()
        if not cls.ffmpeg:
            raise RuntimeError("Gerçek ffmpeg entegrasyon testi için ffmpeg bulunamadı")

    def setUp(self):
        self.temp = Path(tempfile.mkdtemp(prefix="whisper-real-ffmpeg-"))
        self.base = self.temp / "base.mp4"
        result = subprocess.run([
            self.ffmpeg, "-y", "-v", "error",
            "-f", "lavfi", "-i", "color=c=blue:s=160x90:d=0.6",
            "-f", "lavfi", "-i", "sine=frequency=440:duration=0.6",
            "-shortest", "-c:v", "libx264", "-c:a", "aac", str(self.base),
        ], capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=20)
        self.assertEqual(result.returncode, 0, result.stderr)

    def tearDown(self):
        shutil.rmtree(self.temp, ignore_errors=True)

    def test_extract_audio_windows_special_paths_and_wave_contract(self):
        names = [
            "boş luk",
            "Türkçe-ğüşi",
            "apostrof-it's",
            "köşeli[1]",
            "amp&percent%",
            "uzun-" + ("dizin-" * 22),
        ]
        for index, name in enumerate(names):
            with self.subTest(name=name):
                directory = self.temp / name
                directory.mkdir()
                source = directory / "girdi video.mp4"
                output = directory / "çıktı ses.wav"
                shutil.copyfile(self.base, source)
                T.extract_audio(source, output, self.ffmpeg)
                with wave.open(str(output), "rb") as wav:
                    self.assertEqual(wav.getframerate(), 16000)
                    self.assertEqual(wav.getnchannels(), 1)
                    self.assertGreater(wav.getnframes(), 1000)

    def test_corrupt_media_error_is_turkish_and_redacted(self):
        source = self.temp / "SECRET&bozuk.mp4"
        output = self.temp / "out.wav"
        source.write_bytes(b"not media")
        with self.assertRaises(RuntimeError) as caught:
            T.extract_audio(source, output, self.ffmpeg)
        message = str(caught.exception)
        self.assertIn("Ses çıkarma", message)
        self.assertNotIn("SECRET", message)
        self.assertFalse(output.exists())

    def test_probe_duration_uses_real_ffprobe(self):
        duration = T.probe_duration(self.base, self.ffmpeg)
        self.assertIsNotNone(duration)
        self.assertGreater(duration, 0.4)
        self.assertLess(duration, 1.0)


if __name__ == "__main__":
    unittest.main(verbosity=2)
