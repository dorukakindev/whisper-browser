"""Pure-Python regression test for language-derived re-export paths."""

import json
import os
import sys
import tempfile
import types
from pathlib import Path


sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import transcribe as T  # noqa: E402


def test_reexport_language_suffix_cannot_escape_output_directory():
    with tempfile.TemporaryDirectory() as td:
        root = Path(td)
        out = root / "safe" / "deep"
        out.mkdir(parents=True)
        source = out / "payload.json"
        source.write_text(json.dumps({
            "language": "..\\..\\escaped",
            "segments": [{"start": 0, "end": 1, "text": "Metin"}],
        }), encoding="utf-8")
        events = []
        original_emit = T.emit
        try:
            T.emit = lambda event, **payload: events.append((event, payload))
            T.reexport_from_json(types.SimpleNamespace(
                input=str(source), output_dir=str(out), formats="srt",
                lang_suffix=True, max_line_width=80, max_lines=2,
                wrap_mode="sentence",
            ))
        finally:
            T.emit = original_emit
        done = [payload for event, payload in events if event == "done"]
        assert len(done) == 1 and len(done[0]["files"]) == 1
        produced = Path(done[0]["files"][0])
        assert produced.parent.resolve() == out.resolve(), produced
        assert produced.name == "payload.und.srt", produced
        assert not (root / "escaped.srt").exists()


if __name__ == "__main__":
    test_reexport_language_suffix_cannot_escape_output_directory()
    print("1 geçti, 0 başarısız (1 test)")
