"""Pure-Python regression tests for generated ASS escaping."""

import os
import sys
import tempfile
from pathlib import Path


sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import transcribe as T  # noqa: E402


def test_ass_literal_escapes_and_speaker_field_are_structurally_safe():
    with tempfile.TemporaryDirectory() as td:
        target = Path(td) / "escape.ass"
        text = "C:\\New\\home {etiket}\nİkinci satır"
        T.write_ass([(0.0, 2.0, text)], target, max_line_width=500,
                    wrap_mode="balanced", speakers={0: "ANLATICI, TEST\nX"})
        raw = target.read_text(encoding="utf-8-sig")
        dialogue = next(line for line in raw.splitlines() if line.startswith("Dialogue:"))
        fields = dialogue.split(":", 1)[1].lstrip().split(",", 9)
        assert len(fields) == 10
        assert fields[4] == "ANLATICI， TEST X", fields
        assert fields[5:9] == ["0", "0", "0", ""], fields
        body = fields[9]
        assert "C:\\⁠New\\⁠home" in body, body
        assert "{etiket}" not in body and "｛etiket｝" in body
        assert body.count("\\N") == 1, body
        assert "\\h" not in body, body


if __name__ == "__main__":
    test_ass_literal_escapes_and_speaker_field_are_structurally_safe()
    print("1 geçti, 0 başarısız (1 test)")
