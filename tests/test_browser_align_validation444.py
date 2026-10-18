import builtins
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
from browser_align import align, drift_statistics
from translation_auth import translation_api_key


class AlignmentValidation(unittest.TestCase):
    def test_only_loopback_can_use_an_sdk_placeholder(self):
        for endpoint in ("http://localhost:1234/v1", "http://127.0.0.1:8000/v1", "http://[::1]:8000/v1"):
            self.assertEqual(translation_api_key("", endpoint), "local-no-auth")
        for endpoint in ("https://api.example/v1", "http://localhost.evil.test/v1", "file:///tmp", "http://u:p@localhost/v1", "invalid"):
            self.assertEqual(translation_api_key("", endpoint), "")
        self.assertEqual(translation_api_key("fixture-key", "https://api.example/v1"), "fixture-key")

    def test_invalid_input_is_not_masked_by_missing_optional_dependencies(self):
        original = builtins.__import__

        def no_optional(name, *args, **kwargs):
            if name in ("srt", "ffsubsync"):
                raise ImportError("optional dependency unavailable")
            return original(name, *args, **kwargs)

        with patch("builtins.__import__", side_effect=no_optional):
            with self.assertRaises(ValueError):
                align(None)
            with self.assertRaises(ValueError):
                align({"targetCues": []})
            cues = [{"start": i, "end": i + .5} for i in range(3)]
            with self.assertRaisesRegex(ValueError, "dosyası"):
                align({"targetCues": cues, "audio": "missing-reference444.wav"})
            with self.assertRaises(ImportError):
                align({"targetCues": cues, "referenceCues": cues})

    def test_drift_includes_outlier_and_end_time(self):
        target = [(i * 2, i * 2 + 1) for i in range(100)]
        mapped = target.copy()
        mapped[-1] = (target[-1][0], target[-1][1] + 60)
        drift = drift_statistics(target, mapped)
        self.assertEqual(drift["maxDrift"], 60)
        self.assertEqual(drift["meanDrift"], .6)
        self.assertEqual(drift["p95Drift"], 0)


if __name__ == "__main__":
    unittest.main()
