"""browser_align ses-referansli kip testleri — ffsubsync stub'ıyla deterministik.

Öneri uygulaması (ffsubsync ses kipi): payload.audio verildiğinde align()
referans altyazı yerine medya yolunu ffsubsync'e verir ve ses-VAD teşhisini
döndürür. Gerçek VAD burada test edilmez — yönlendirme/sözleşme doğrulanır.
"""

import argparse
import json
import os
import sys
import tempfile
import types
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))


def _install_ffsubsync_stub(captured):
    """ffsubsync.run'ı stub'lar: hedef dosyayı olduğu gibi kopyalar (kimlik
    eşlemesi) ve çağrı argümanlarını kaydeder."""
    fake = types.ModuleType("ffsubsync")
    inner = types.ModuleType("ffsubsync.ffsubsync")

    def make_parser():
        parser = argparse.ArgumentParser()
        parser.add_argument("reference")
        parser.add_argument("-i", dest="srtin")
        parser.add_argument("-o", dest="srtout")
        parser.add_argument("--split-penalty", dest="split_penalty")
        return parser

    def run(args):
        captured.append(dict(reference=args.reference, srtin=args.srtin, srtout=args.srtout))
        with open(args.srtin, "r", encoding="utf-8-sig") as handle:
            data = handle.read()
        with open(args.srtout, "w", encoding="utf-8-sig") as handle:
            handle.write(data)
        return {"sync_was_successful": True}

    fake.run = run
    fake.ffsubsync = inner
    inner.make_parser = make_parser
    sys.modules["ffsubsync"] = fake
    sys.modules["ffsubsync.ffsubsync"] = inner


def _cues(count=6, base=10.0):
    return [{"start": base + i * 3, "end": base + i * 3 + 1.5, "text": f"Satır {i}"}
            for i in range(count)]


class AlignAudioModeTests(unittest.TestCase):
    def setUp(self):
        self.captured = []
        _install_ffsubsync_stub(self.captured)
        import importlib
        import browser_align
        importlib.reload(browser_align)
        self.mod = browser_align

    def test_audio_mode_passes_media_path_to_ffsubsync(self):
        with tempfile.NamedTemporaryFile(suffix=".mkv", delete=False) as media:
            media.write(b"fake-media")
            media_path = media.name
        try:
            result = self.mod.align({"audio": media_path, "targetCues": _cues()})
        finally:
            os.unlink(media_path)
        self.assertEqual(self.captured[0]["reference"], media_path,
                         "ses kipi referans olarak medya yolunu vermeli")
        diag = result["diagnostics"]
        self.assertEqual(diag["method"], "ffsubsync-audio-vad")
        self.assertIsNone(diag["overlapBefore"])
        self.assertIsNone(diag["overlapAfter"])
        self.assertEqual(diag["autoApply"], False)
        self.assertEqual(len(result["times"]), 6)
        self.assertAlmostEqual(result["times"][2][0], 16.0)

    def test_audio_missing_file_rejected(self):
        with self.assertRaises(ValueError) as ctx:
            self.mod.align({"audio": "/nonexistent/video.mkv", "targetCues": _cues()})
        self.assertIn("Ses referansı", str(ctx.exception))
        self.assertEqual(self.captured, [], "dosya yoksa ffsubsync çalışmamalı")

    def test_subtitle_reference_mode_still_works(self):
        result = self.mod.align({"referenceCues": _cues(base=20.0),
                                 "targetCues": _cues()})
        self.assertEqual(self.captured[0]["reference"].endswith("reference.srt"), True,
                         "altyazı kipi referans dosyası yazmalı")
        self.assertEqual(result["diagnostics"]["method"],
                         "ffsubsync-piecewise-subtitle-reference")
        self.assertIsNotNone(result["diagnostics"]["overlapBefore"])


if __name__ == "__main__":
    unittest.main()
