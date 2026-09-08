"""Pure-Python regression test for JSON word-array re-export."""

import json
import os
import sys
import tempfile
import types
from pathlib import Path


sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import transcribe as T  # noqa: E402


def test_reexport_json_preserves_segment_word_arrays_byte_for_byte():
    with tempfile.TemporaryDirectory() as td:
        root = Path(td)
        source = root / "words.json"
        entries = [(0.0, 1.0, "Bir"), (1.01, 2.0, "İki")]
        shared_boundary_word = {
            "word": " sınır", "start": 0.99, "end": 1.02, "probability": 0.9,
        }
        info = T._WxInfo(language="tr", language_probability=0.875, duration=2.0)
        T.write_json(entries, source, info=info, all_words=[shared_boundary_word])
        expected = source.read_bytes()
        events = []
        original_emit = T.emit
        try:
            T.emit = lambda event, **payload: events.append((event, payload))
            T.reexport_from_json(types.SimpleNamespace(
                input=str(source), output_dir=str(root / "out"), formats="json",
                lang_suffix=False, max_line_width=80, max_lines=2,
                wrap_mode="sentence",
            ))
        finally:
            T.emit = original_emit
        done = [payload for event, payload in events if event == "done"]
        assert len(done) == 1
        produced = Path(done[0]["files"][0])
        assert json.loads(produced.read_text(encoding="utf-8")) == json.loads(
            expected.decode("utf-8"))
        assert produced.read_bytes() == expected


if __name__ == "__main__":
    test_reexport_json_preserves_segment_word_arrays_byte_for_byte()
    print("1 geçti, 0 başarısız (1 test)")
