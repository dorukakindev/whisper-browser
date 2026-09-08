"""Pure-Python regression test for zero-probability JSON metadata."""

import json
import os
import sys
import tempfile
import types
from pathlib import Path


sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import transcribe as T  # noqa: E402


def test_reexport_preserves_explicit_zero_language_probability():
    with tempfile.TemporaryDirectory() as td:
        root = Path(td)
        source = root / "zero-probability.json"
        T.write_json(
            [(0.0, 1.0, "Metin")], source,
            info=T._WxInfo(language="tr", language_probability=0.0, duration=1.0),
        )
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
        payload = json.loads(Path(done[0]["files"][0]).read_text(encoding="utf-8"))
        assert payload["language_probability"] == 0.0, payload
        language = [payload for event, payload in events if event == "language"]
        assert language == [{"code": "tr", "probability": 0.0, "duration": 1.0}]


if __name__ == "__main__":
    test_reexport_preserves_explicit_zero_language_probability()
    print("1 geçti, 0 başarısız (1 test)")
