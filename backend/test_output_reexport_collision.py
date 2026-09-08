"""Pure-Python regression tests for re-export source collisions."""

import json
import os
import sys
import tempfile
import types
from pathlib import Path


sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import transcribe as T  # noqa: E402


def test_reexport_json_does_not_overwrite_its_source_path():
    for lang_suffix, filename in ((False, "source.json"), (True, "source.tr.json")):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            source = root / filename
            source.write_text(json.dumps({
                "version": 0,
                "language": "tr",
                "extra_sentinel": "kaynak korunmalı",
                "segments": [{"start": 0, "end": 1, "text": "Metin"}],
            }, ensure_ascii=False), encoding="utf-8")
            original = source.read_bytes()
            events = []
            original_emit = T.emit
            try:
                T.emit = lambda event, **payload: events.append((event, payload))
                T.reexport_from_json(types.SimpleNamespace(
                    input=str(source), output_dir=str(root), formats="json",
                    lang_suffix=lang_suffix, max_line_width=80, max_lines=2,
                    wrap_mode="sentence",
                ))
            finally:
                T.emit = original_emit
            assert source.read_bytes() == original
            done = [payload for event, payload in events if event == "done"]
            assert len(done) == 1 and len(done[0]["files"]) == 1
            produced = Path(done[0]["files"][0])
            assert produced != source
            assert produced.exists()
            assert produced.name.endswith(".reexport.json"), produced


if __name__ == "__main__":
    test_reexport_json_does_not_overwrite_its_source_path()
    print("2 geçti, 0 başarısız (2 path-collision vakası)")
