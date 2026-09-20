"""F17 — model_benchmark.py A/B karşılaştırma sözleşmesi."""
import json
import os
import subprocess
import sys
import tempfile
import types
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(__file__))
import model_benchmark


def _sine_wav(path, seconds=35.0):
    subprocess.run(
        ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
         "-f", "lavfi", "-i", f"sine=frequency=440:duration={seconds}",
         "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", path],
        check=True)


class _Seg:
    def __init__(self, start, text):
        self.start = start
        self.end = start + 1.0
        self.text = text


class _Info:
    language = "en"


def _fake_whisper(segments_map):
    """model adına göre segment listesi döndüren sahte faster_whisper."""
    module = types.ModuleType("faster_whisper")

    class WhisperModel:  # noqa: D401
        def __init__(self, name, device="cpu", compute_type="int8"):
            self.name = name

        def transcribe(self, wav_path, language=None, vad_filter=True, beam_size=5):
            return iter(segments_map[self.name]), _Info()

    module.WhisperModel = WhisperModel
    return module


class ModelBenchmarkCompare(unittest.TestCase):
    def _run(self, tmp, extra_args, segments_map):
        wav = os.path.join(tmp, "clip.wav")
        _sine_wav(wav)
        events = []
        with mock.patch.dict(sys.modules, {"faster_whisper": _fake_whisper(segments_map)}):
            old = model_benchmark.emit
            model_benchmark.emit = lambda payload: events.append(payload)
            try:
                argv = ["model_benchmark.py", "--input", wav, "--model", "small",
                        "--device", "cpu", "--compute-type", "int8",
                        "--ffmpeg", "ffmpeg"] + extra_args
                with mock.patch.object(sys, "argv", argv):
                    model_benchmark.main()
            finally:
                model_benchmark.emit = old
        return events

    def test_compare_emits_clip_hash_and_diff(self):
        with tempfile.TemporaryDirectory() as tmp:
            segs = {
                "small": [_Seg(0.0, "hello"), _Seg(1.0, "world")],
                "tiny": [_Seg(0.2, "hello"), _Seg(1.1, "word")],
            }
            [result] = self._run(tmp, ["--compare-model", "tiny"], segs)
            self.assertTrue(result["ok"])
            self.assertEqual(len(result["clipHash"]), 64)
            self.assertEqual(result["compare"]["model"], "tiny")
            self.assertAlmostEqual(result["diff"]["cueStartDriftAvgMs"], 150.0)
            self.assertGreater(result["diff"]["textDeviation"], 0)
            self.assertNotIn("segments", result["compare"])
            self.assertNotIn("segments", result)

    def test_single_mode_unchanged_keys(self):
        with tempfile.TemporaryDirectory() as tmp:
            [result] = self._run(tmp, [], {"small": [_Seg(0.0, "x")]})
            for key in ("ok", "model", "device", "computeType", "audioSeconds",
                        "loadSeconds", "transcribeSeconds", "realtimeFactor",
                        "speedX", "segmentCount", "language", "clipHash", "vramMb"):
                self.assertIn(key, result)
            self.assertNotIn("compare", result)
            self.assertNotIn("diff", result)

    def test_same_clip_same_hash(self):
        with tempfile.TemporaryDirectory() as tmp:
            [a] = self._run(tmp, [], {"small": [_Seg(0.0, "x")]})
            [b] = self._run(tmp, [], {"small": [_Seg(0.0, "x")]})
            self.assertEqual(a["clipHash"], b["clipHash"])


if __name__ == "__main__":
    unittest.main()
