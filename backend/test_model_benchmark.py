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
    def _run(self, tmp, extra_args, segments_map, source_seconds=35.0):
        wav = os.path.join(tmp, "clip.wav")
        _sine_wav(wav, source_seconds)
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
            self.assertEqual(result["diff"]["matchedCueCount"], 2)
            self.assertEqual(result["diff"]["primaryUnmatchedCueCount"], 0)
            self.assertEqual(result["diff"]["compareUnmatchedCueCount"], 0)
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

    def test_start_and_duration_select_the_requested_clip(self):
        with tempfile.TemporaryDirectory() as tmp:
            [result] = self._run(
                tmp, ["--start", "10", "--seconds", "60"],
                {"small": [_Seg(0.0, "x")]}, source_seconds=80.0)
            self.assertAlmostEqual(result["clipStartSeconds"], 10.0)
            self.assertGreater(result["audioSeconds"], 59.0)
            self.assertLessEqual(result["audioSeconds"], 60.1)

    def test_alignment_reports_segmentation_mismatch(self):
        primary = [{"start": 0.0}, {"start": 3.0}, {"start": 30.0}]
        compare = [{"start": 0.1}, {"start": 3.2}]
        drifts, primary_unmatched, compare_unmatched = model_benchmark.align_segment_starts(primary, compare)
        self.assertEqual(len(drifts), 2)
        self.assertEqual(primary_unmatched, 1)
        self.assertEqual(compare_unmatched, 0)

    def test_nvidia_smi_parser_measures_current_process(self):
        completed = types.SimpleNamespace(stdout="100, 512\n200, 1024\n100, 64\n")
        runner = mock.Mock(return_value=completed)
        self.assertEqual(model_benchmark.query_process_vram_mib(100, runner), 576.0)
        runner.assert_called_once()

    def test_vram_sampler_takes_final_sample_for_fast_models(self):
        values = iter([None, 768.0])
        sampler = model_benchmark.VramSampler(
            query=lambda: next(values, 768.0), global_query=lambda: 100.0, interval=60)
        sampler.start()
        self.assertEqual(sampler.stop(), 768.0)
        self.assertEqual(sampler.scope, "process")

    def test_vram_sampler_uses_labelled_gpu_delta_on_wddm(self):
        totals = iter([1000.0, 1256.0, 1256.0])
        sampler = model_benchmark.VramSampler(
            query=lambda: None, global_query=lambda: next(totals, 1256.0), interval=60)
        sampler.start()
        self.assertEqual(sampler.stop(), 256.0)
        self.assertEqual(sampler.scope, "gpu-delta")

    def test_corrupt_input_raises_called_process_error(self):
        """Bozuk girdi dosyası ffmpeg'i patlatır — __main__ sarmalı ok:false'a
        çevirir; main() seviyesinde hata sessizce yutulmamalı."""
        with tempfile.TemporaryDirectory() as tmp:
            bad = os.path.join(tmp, "corrupt.mp4")
            with open(bad, "wb") as f:
                f.write(b"this is not a media file" * 64)
            argv = ["model_benchmark.py", "--input", bad, "--model", "small",
                    "--device", "cpu", "--ffmpeg", "ffmpeg"]
            with mock.patch.object(sys, "argv", argv):
                with self.assertRaises(subprocess.CalledProcessError):
                    model_benchmark.main()

    def test_start_beyond_duration_reports_no_measurable_audio(self):
        """--start süreden uzunsa ffmpeg boş wav üretir; 'ölçülebilir ses yok'
        RuntimeError'ı ok:false'a çevrilir (çöküş değil)."""
        with tempfile.TemporaryDirectory() as tmp:
            wav = os.path.join(tmp, "clip.wav")
            _sine_wav(wav, 5.0)
            argv = ["model_benchmark.py", "--input", wav, "--model", "small",
                    "--device", "cpu", "--ffmpeg", "ffmpeg",
                    "--start", "3600", "--seconds", "30"]
            with mock.patch.object(sys, "argv", argv):
                with self.assertRaises(RuntimeError) as ctx:
                    model_benchmark.main()
            self.assertIn("ölçülebilir ses", str(ctx.exception))

    def test_result_json_roundtrip_preserves_schema(self):
        """Emit edilen sonuç JSON roundtrip'ten bozulmadan çıkar —
        renderer/teşhis tarafı yeniden okuyabilir."""
        with tempfile.TemporaryDirectory() as tmp:
            [result] = self._run(tmp, ["--compare-model", "tiny"], {
                "small": [_Seg(0.0, "hello")], "tiny": [_Seg(0.0, "hello")]})
            clone = json.loads(json.dumps(result))
            self.assertEqual(clone, result)
            self.assertEqual(len(clone["clipHash"]), 64)
            self.assertEqual(clone["diff"]["matchedCueCount"], 1)


if __name__ == "__main__":
    unittest.main()
