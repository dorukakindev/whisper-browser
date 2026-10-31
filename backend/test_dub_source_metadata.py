"""Focused source provenance checks for both real subtitle export producers."""
import hashlib
import json
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest.mock import patch
import test_transcribe as F

T = F.T


def produce_whisper_translation(folder):
    class Model:
        def __init__(self, *_args, **_kwargs):
            pass
        def transcribe(self, *_args, **_kwargs):
            rows = [(1.125, 3.25, "I gave her the book."), (4.375, 6.5, "Then I left.")]
            return iter([types.SimpleNamespace(start=s, end=e, text=t, words=[])
                         for s, e, t in rows]), types.SimpleNamespace(language="en", language_probability=1., duration=7.)
    fake = types.ModuleType("faster_whisper")
    fake.WhisperModel = Model
    source = folder / "whisper.mp4"
    source.write_bytes(b"fixture")
    argv = ["transcribe.py", "--input", str(source), "--output-dir", str(folder),
            "--engine", "faster", "--split-mode", "none", "--formats", "srt,txt",
            "--translate", "true", "--translate-to", "tr", "--translate-for-speech", "true"]
    for option in ["resume", "merge-short", "merge-incomplete", "merge-continuation", "fix-common-errors",
                   "drop-repeated-hallucinations", "snap-to-speech", "fix-timings", "dedupe",
                   "drop-trailing-hallucination", "fix-punctuation-collapse", "quality-report"]:
        argv.extend(["--" + option, "false"])
    with patch.object(sys, "argv", argv), patch.object(T, "transcribe") as capture:
        T.main()
    args = capture.call_args.args[0]
    def translate(entries, _args, _warnings, source_lang=None, status_out=None, **_kwargs):
        status_out.update(completed=list(range(len(entries))), failed=[])
        return [(s, e, ["Kitabı ona verdim.", "Sonra ayrıldım."][i]) for i, (s, e, _) in enumerate(entries)]
    with patch.dict(sys.modules, {"faster_whisper": fake}), \
            patch.object(T, "find_ffmpeg", return_value="ffmpeg"), \
            patch.object(T, "resolve_device_and_compute", return_value=("cpu", "int8")), \
            patch.object(T, "build_prompt_and_hotwords", return_value=("", "", "")), \
            patch.object(T, "extract_audio"), patch.object(T, "log"), patch.object(T, "emit"), \
            patch.object(T, "_wx_free_gpu"), patch.object(T, "llm_translate", side_effect=translate):
        T.transcribe(args)
    return folder / "whisper.tr.speech.srt"


class SourceMetadataTests(unittest.TestCase):
    def test_whisper_translation_exports_bound_original_snapshot(self):
        with tempfile.TemporaryDirectory() as directory:
            output = produce_whisper_translation(Path(directory))
            self.assertTrue(output.is_file())
            value = json.loads(Path(str(output) + ".meta.json").read_text(encoding="utf-8"))
            self.assertEqual(value["subtitleHash"], hashlib.sha256(output.read_bytes()).hexdigest())
            self.assertEqual([row["text"] for row in value["originalCues"]], ["I gave her the book.", "Then I left."])
            self.assertEqual([row["text"] for row in value["cues"]], ["Kitabı ona verdim.", "Sonra ayrıldım."])
            self.assertTrue(value["forSpeech"])
            self.assertEqual((value["role"], value["total"], value["completed"], value["failed"]), ("translation", 2, 2, 0))
            self.assertEqual(value["speechProtocol"], T.SPEECH_TRANSLATION_PROTOCOL)
            self.assertEqual([row["status"] for row in value["cues"]], ["completed", "completed"])

    def test_shared_writer_uses_actual_rendered_text_and_rejects_bad_alignment(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            original = [(1., 3., "I gave her the book.")]
            translated = [(1., 3., "Kitabı ona verdim.")]
            args = F._TrArgs(translate_for_speech=True)
            tx = T.OutputTransaction(root)
            output = root / "speech.srt"
            def writer(staged):
                T.write_srt([(1., 3., "Ali: Kitabı ona verdim.")], staged)
                T.stage_translation_metadata(tx, output, staged, original, translated, args, {0}, "fixture")
            tx.stage(output, writer)
            tx.commit()
            value = json.loads(Path(str(output) + ".meta.json").read_text(encoding="utf-8"))
            self.assertEqual(value["cues"][0]["text"], "Ali: Kitabı ona verdim.")
            self.assertEqual(value["originalCues"][0]["text"], original[0][2])
            tx = T.OutputTransaction(root)
            bad = root / "bad.srt"
            def bad_writer(staged):
                T.write_srt([(2., 4., "Kitabı ona verdim.")], staged)
                T.stage_translation_metadata(tx, bad, staged, original, translated, args, {0}, "fixture")
            tx.stage(bad, bad_writer)
            tx.commit()
            self.assertNotIn("originalCues", json.loads(Path(str(bad) + ".meta.json").read_text(encoding="utf-8")))


if __name__ == "__main__":
    unittest.main()
