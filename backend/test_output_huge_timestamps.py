"""Pure-Python regression tests for writer/reader huge timestamps."""

import os
import sys
import tempfile
from pathlib import Path


sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import transcribe as T  # noqa: E402


def test_own_readers_accept_three_digit_hours_written_by_output_writers():
    entries = [(360000.0, 360001.25, "Yüz saat"),
               (999999.0, 1000000.0, "Daha büyük")]
    with tempfile.TemporaryDirectory() as td:
        root = Path(td)
        srt = root / "huge.srt"
        vtt = root / "huge.vtt"
        T.write_srt(entries, srt, wrap_mode="none")
        T.write_vtt(entries, vtt, wrap_mode="none")
        parsed_srt = T.parse_srt(srt.read_text(encoding="utf-8-sig"))
        parsed_vtt = T.parse_srt(vtt.read_text(encoding="utf-8"))
        assert parsed_srt == entries
        assert parsed_vtt == entries


if __name__ == "__main__":
    test_own_readers_accept_three_digit_hours_written_by_output_writers()
    print("1 geçti, 0 başarısız (1 test)")
