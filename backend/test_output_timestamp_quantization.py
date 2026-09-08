"""Pure-Python regression test for direct/re-export time quantization."""

import os
import sys
import tempfile
import types
from pathlib import Path


sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import transcribe as T  # noqa: E402


def test_submillisecond_edges_are_byte_equal_after_json_reexport():
    entries = [
        (0.0005, 0.0149, "İlk"),
        (59.9996, 60.0055, "İkinci"),
        (3599.9996, 3600.0045, "Üçüncü"),
    ]
    with tempfile.TemporaryDirectory() as td:
        root = Path(td)
        direct = root / "direct"
        out = root / "out"
        direct.mkdir()
        source = direct / "times.json"
        srt = direct / "times.srt"
        ass = direct / "times.ass"
        info = T._WxInfo(language="tr", language_probability=1.0, duration=3600.0045)
        T.write_json(entries, source, info=info)
        T.write_srt(entries, srt, wrap_mode="none")
        T.write_ass(entries, ass, wrap_mode="none")
        original_emit = T.emit
        try:
            T.emit = lambda *_args, **_kwargs: None
            T.reexport_from_json(types.SimpleNamespace(
                input=str(source), output_dir=str(out), formats="srt,ass,json",
                lang_suffix=False, max_line_width=80, max_lines=2,
                wrap_mode="none",
            ))
        finally:
            T.emit = original_emit
        assert (out / "times.srt").read_bytes() == srt.read_bytes()
        assert (out / "times.ass").read_bytes() == ass.read_bytes()
        assert (out / "times.json").read_bytes() == source.read_bytes()


if __name__ == "__main__":
    test_submillisecond_edges_are_byte_equal_after_json_reexport()
    print("1 geçti, 0 başarısız (3 timestamp-edge vakası)")
