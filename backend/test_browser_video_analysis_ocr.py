"""R216: browser_video_analysis.ocr_range gerçek RapidOCR motoruyla uçtan-uca.

Kareler PIL ile üretilir (büyük siyah metin / beyaz zemin — motor için
deterministik yakın girdi). Zaman matematiği, cue birleştirme ve hata
zarfı sözleşmesi kesin; tanınan metin yalnız anahtar kelime düzeyinde
doğrulanır (OCR boşluk/uzatı üretebilir).
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parent / "browser_video_analysis.py"


def _frame(path, text, size=(640, 160), pos=(16, 44)):
    from PIL import Image, ImageDraw, ImageFont

    img = Image.new("RGB", size, "white")
    draw = ImageDraw.Draw(img)
    try:
        font = ImageFont.load_default(size=64)
    except TypeError:
        font = ImageFont.load_default()
    draw.text(pos, text, fill="black", font=font)
    img.save(path)


def _run(request, timeout=180):
    proc = subprocess.run(
        [sys.executable, str(SCRIPT)],
        input=json.dumps(request).encode("utf-8"),
        capture_output=True, timeout=timeout)
    out = proc.stdout.decode("utf-8", "replace").strip()
    return json.loads(out) if out else {"ok": False, "error": proc.stderr.decode("utf-8", "replace")[-400:]}


class OcrRangeE2ETests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        try:
            import rapidocr_onnxruntime  # noqa: F401
            from PIL import Image  # noqa: F401
            import numpy  # noqa: F401
        except ImportError as exc:
            raise unittest.SkipTest(f"OCR bağımlılıkları yok: {exc}")
        cls.dir = Path(tempfile.mkdtemp(prefix="ocr-e2e-"))
        a = cls.dir / "a.png"
        b = cls.dir / "b.png"
        _frame(a, "HELLO WORLD")
        _frame(b, "GOODBYE")
        cls.frame_a, cls.frame_b = str(a), str(b)

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.dir, ignore_errors=True)

    def test_cues_merge_and_times(self):
        r = _run({"operation": "ocrRange",
                  "frames": [self.frame_a] * 3 + [self.frame_b] * 2,
                  "start": 0, "end": 5, "interval": 1})
        self.assertTrue(r.get("ok"), r)
        cues = r["cues"]
        self.assertGreaterEqual(len(cues), 2, cues)
        first, second = cues[0], cues[1]
        self.assertIn("HELLO", first["text"].upper())
        self.assertIn("GOODBYE", second["text"].upper())
        self.assertEqual(first["start"], 0)
        self.assertAlmostEqual(first["end"], 3.0)
        self.assertEqual(second["start"], 3)
        self.assertAlmostEqual(second["end"], 5.0)
        self.assertGreaterEqual(r["diagnostics"]["recognizedFrames"], 4)

    def test_blank_frames_emit_no_cue(self):
        blank = self.dir / "blank.png"
        from PIL import Image
        Image.new("RGB", (640, 160), "white").save(blank)
        r = _run({"operation": "ocrRange",
                  "frames": [str(blank), self.frame_a, str(blank)],
                  "start": 10, "end": 13, "interval": 1})
        self.assertTrue(r.get("ok"), r)
        self.assertEqual(len(r["cues"]), 1, r["cues"])
        self.assertEqual(r["cues"][0]["start"], 11)
        self.assertAlmostEqual(r["cues"][0]["end"], 12.0)

    def test_crop_bounds_validated_and_applied(self):
        r = _run({"operation": "ocrRange", "frames": [self.frame_a],
                  "start": 0, "end": 1, "interval": 1,
                  "crop": {"x": 0, "y": 0, "width": 1, "height": 0.15}})
        self.assertTrue(r.get("ok"), r)
        self.assertEqual(r["diagnostics"]["recognizedFrames"], 0)
        bad = _run({"operation": "ocrRange", "frames": [self.frame_a],
                    "start": 0, "end": 1, "interval": 1,
                    "crop": {"x": 0.9, "y": 0, "width": 0.5, "height": 0.5}})
        self.assertFalse(bad.get("ok"))
        self.assertIn("bölge", bad.get("error", ""))

    def test_invalid_requests_error_envelope(self):
        base = {"operation": "ocrRange", "frames": [self.frame_a], "start": 0, "end": 1, "interval": 1}
        for patch, needle in (
            ({"start": 2, "end": 1}, "geçersiz"),
            ({"start": 0, "end": 61}, "geçersiz"),
            ({"interval": 0.1}, "geçersiz"),
            ({"frames": [self.frame_a] * 121}, "geçersiz"),
            ({"operation": "nope"}, "Bilinmeyen"),
        ):
            r = _run({**base, **patch})
            self.assertFalse(r.get("ok"), (patch, r))
            self.assertIn(needle, r.get("error", ""), (patch, r))

    def test_missing_frame_file_error(self):
        r = _run({"operation": "ocrRange", "frames": [str(self.dir / "yok.png")],
                  "start": 0, "end": 1, "interval": 1})
        self.assertFalse(r.get("ok"))
        self.assertTrue(r.get("error"))

    def test_stdin_size_cap(self):
        # main() stdin'i 1MB ile sınırlar; dev istek ok:false veya kesilmiş
        # JSON yerine temiz bir hata zarfı döndürmeli.
        r = _run({"operation": "ocrRange", "pad": "x" * (2 * 1024 * 1024),
                  "frames": [self.frame_a], "start": 0, "end": 1, "interval": 1})
        self.assertFalse(r.get("ok"))


if __name__ == "__main__":
    unittest.main()
