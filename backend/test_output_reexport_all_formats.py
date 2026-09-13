"""Aynı Unicode/zaman verisinin bütün yeniden dışa aktarma biçimlerinde korunması."""

import json
import tempfile
import types
import unittest
from pathlib import Path
from unittest import mock

import transcribe as T


class ReexportAllFormatsTests(unittest.TestCase):
    def test_all_formats_preserve_order_timing_unicode_and_source(self):
        with tempfile.TemporaryDirectory() as work:
            root = Path(work)
            source = root / "çokdilli.tr.json"
            output = root / "çıktı"
            payload = {
                "language": "tr", "language_probability": .98, "duration": 5.0,
                "segments": [
                    {"start": 2.5, "end": 4.75, "text": "สวัสดีโลก 🙂", "speaker": "B"},
                    {"start": 0.25, "end": 2.0, "text": "İstanbul — こんにちは世界", "speaker": "A",
                     "words": [{"word": " İstanbul", "start": .25, "end": .9, "probability": .99}]},
                ],
            }
            source.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
            original = source.read_bytes()
            events = []
            args = types.SimpleNamespace(
                input=str(source), output_dir=str(output),
                formats="srt,vtt,txt,ass,json", lang_suffix=False,
                max_line_width=120, max_lines=3, wrap_mode="sentence",
                label_speakers=True, youtube="",
            )
            with mock.patch.object(
                    T, "emit", side_effect=lambda kind, **data: events.append((kind, data))):
                T.reexport_from_json(args)

            done = [data for kind, data in events if kind == "done"][-1]
            paths = {Path(value).suffix: Path(value) for value in done["files"]}
            self.assertEqual(set(paths), {".srt", ".vtt", ".txt", ".ass", ".json"})
            self.assertEqual(source.read_bytes(), original)
            for path in paths.values():
                self.assertTrue(path.exists() and path.stat().st_size > 0, path)

            srt_raw = paths[".srt"].read_bytes()
            ass_raw = paths[".ass"].read_bytes()
            self.assertTrue(srt_raw.startswith(b"\xef\xbb\xbf"))
            self.assertTrue(ass_raw.startswith(b"\xef\xbb\xbf"))
            srt = srt_raw.decode("utf-8-sig")
            vtt = paths[".vtt"].read_text(encoding="utf-8-sig")
            txt = paths[".txt"].read_text(encoding="utf-8-sig")
            ass = ass_raw.decode("utf-8-sig")
            rebuilt = json.loads(paths[".json"].read_text(encoding="utf-8"))
            for text in ("İstanbul", "こんにちは世界", "สวัสดีโลก", "🙂"):
                self.assertTrue(any(text in value for value in (srt, vtt, txt, ass))
                                or any(text in row["text"] for row in rebuilt["segments"]))
            self.assertLess(srt.index("00:00:00,250"), srt.index("00:00:02,500"))
            self.assertIn("00:00:00.250 --> 00:00:02.000", vtt)
            self.assertEqual([row["start"] for row in rebuilt["segments"]], [.25, 2.5])
            self.assertEqual(rebuilt["segments"][0]["speaker"], "A")
            self.assertEqual(rebuilt["segments"][0]["words"][0]["word"], " İstanbul")


if __name__ == "__main__":
    unittest.main()
