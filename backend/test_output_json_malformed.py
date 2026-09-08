"""Pure-Python fault-injection tests for partially malformed JSON segments."""

import json
import os
import sys
import tempfile
import types
from pathlib import Path


sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import transcribe as T  # noqa: E402


def test_reexport_skips_bad_records_when_valid_segments_remain():
    with tempfile.TemporaryDirectory() as td:
        root = Path(td)
        source = root / "partially-malformed.json"
        source.write_text(json.dumps({
            "language": "tr",
            "segments": [
                None,
                42,
                {"start": float("nan"), "end": 1, "text": "NaN"},
                {"start": 0, "end": float("inf"), "text": "Infinity"},
                {"start": 0, "end": 1, "text": 123},
                {"start": 2, "end": 3, "text": "Geçerli segment"},
            ],
        }), encoding="utf-8")
        events = []
        original_emit = T.emit
        try:
            T.emit = lambda event, **payload: events.append((event, payload))
            T.reexport_from_json(types.SimpleNamespace(
                input=str(source), output_dir=str(root / "out"), formats="srt,json",
                lang_suffix=False, max_line_width=80, max_lines=2,
                wrap_mode="none",
            ))
        finally:
            T.emit = original_emit
        done = [payload for event, payload in events if event == "done"]
        assert len(done) == 1
        assert done[0]["segments"] == 1
        assert len(done[0]["warnings"]) == 1
        assert "5 geçersiz segment" in done[0]["warnings"][0]
        payload = json.loads((root / "out" / "partially-malformed.json").read_text("utf-8"))
        assert [segment["text"] for segment in payload["segments"]] == ["Geçerli segment"]


if __name__ == "__main__":
    test_reexport_skips_bad_records_when_valid_segments_remain()
    print("1 geçti, 0 başarısız (5 fault kaydı + 1 geçerli kayıt)")
