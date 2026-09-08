"""Pure-Python regression tests for cross-platform embedded newlines."""

import os
import sys
import tempfile
from pathlib import Path


sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import transcribe as T  # noqa: E402


def test_balanced_wrap_normalizes_crlf_before_format_writers():
    text = "Birinci satır\r\nİkinci satır\rÜçüncü satır"
    assert T.wrap_text(text, 500, 3, wrap_mode="balanced") == (
        "Birinci satır\nİkinci satır\nÜçüncü satır"
    )
    with tempfile.TemporaryDirectory() as td:
        target = Path(td) / "newlines.ass"
        T.write_ass([(0.0, 2.0, text)], target, max_line_width=500,
                    wrap_mode="balanced")
        raw = target.read_text(encoding="utf-8-sig")
        dialogue = next(line for line in raw.splitlines() if line.startswith("Dialogue:"))
        assert "Birinci satır\\Nİkinci satır\\NÜçüncü satır" in dialogue
        assert "\r" not in dialogue


if __name__ == "__main__":
    test_balanced_wrap_normalizes_crlf_before_format_writers()
    print("1 geçti, 0 başarısız (1 test)")
