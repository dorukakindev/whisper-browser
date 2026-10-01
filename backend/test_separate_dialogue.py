"""separate_dialogue.py — sözleşme kilidi."""
import json
import sys
import types
import unittest


class _Seg:
    start = 1.0
    end = 2.0
    text = "hello"


class _Info:
    language = "en"


class _FakeWhisper:
    def __init__(self, *args, **kwargs):
        pass

    def transcribe(self, *args, **kwargs):
        return [_Seg()], _Info()


def _load_module():
    fake = types.ModuleType("faster_whisper")
    fake.WhisperModel = _FakeWhisper
    sys.modules["faster_whisper"] = fake
    import separate_dialogue
    return separate_dialogue


class SeparateDialogueTests(unittest.TestCase):
    def test_nonfinite_clip_start_is_rejected_before_serialisation(self):
        # R369 — NaN/±inf başlangıç ofseti cue'lara sızıp json.dumps'ın
        # çıplak NaN/Infinity literal basmasına izin veriyordu (geçersiz
        # JSON → ana süreç parse hatası). Artık erken ValueError.
        module = _load_module()
        for bad in (float("nan"), float("inf"), float("-inf")):
            with self.assertRaises(ValueError):
                module.transcribe({"operation": "transcribe", "audio": "x",
                                   "start": bad})

    def test_finite_offset_shifts_cue_times(self):
        module = _load_module()
        out = module.transcribe({"operation": "transcribe", "audio": "x",
                                 "start": 12.5})
        self.assertEqual(out["cues"], [{"start": 13.5, "end": 14.5,
                                        "text": "hello"}])
        self.assertEqual(out["language"], "en")


if __name__ == "__main__":
    unittest.main()
