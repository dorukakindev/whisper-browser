"""Golden, differential, metamorphic, and mutation tests for subtitle outputs.

The suite is pure Python. It never starts Electron, ffmpeg, Whisper, a GPU
process, or a network client.
"""

import json
import os
import re
import sys
import tempfile
import types
from pathlib import Path


sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import transcribe as T  # noqa: E402


TEXT_FIXTURES = [
    ("tr", "Türkçe: Iğdır'da çığ, şüphe ve ölçü vardı."),
    ("en", "Emoji stay intact: 🧪🎬👩🏽‍💻 — done!"),
    ("ar", "نص عربي من اليمين إلى اليسار."),
    ("he", "טקסט עברי מימין לשמאל."),
    ("zh", "中文与日本語の字幕。かなカナ"),
    ("en", "Literal path C:\\New\\home\\clip.mkv remains visible."),
    ("en", "ASS-looking {\\b1} text is data, not a style tag."),
    ("tr", "Birinci satır\r\nİkinci satır\rÜçüncü satır"),
    ("en", "Commas, arrows --> ampersands & angle <text> survive."),
    ("fr", "Combining Unicode: cafe\u0301, naïve, déjà vu."),
    ("en", "Quoted “text”, apostrophe's place, and [brackets]."),
    ("tr", "Bu oldukça uzun bir doğal cümledir; satır sarma kararının aynı "
           "girdi ve ayarlarda her çalıştırmada değişmediğini kanıtlar."),
]


TIMING_FIXTURES = [
    ((0.0, 1.234), (1.5, 2.75), (3.0, 5.0)),
    ((0.0, 0.0), (0.001, 0.001), (0.002, 0.010)),
    ((123.456, 124.999), (125.0, 125.5), (130.0, 131.0)),  # clip offset
    ((59.9996, 60.0004), (3599.9996, 3600.0004), (3600.5, 3601.5)),
    ((360000.0, 360001.0), (360002.25, 360004.5), (999999.0, 1000000.0)),
    ((0.0004, 0.0005), (0.0014, 0.0015), (0.0024, 0.0025)),
    ((0.0, 1.0), (0.98, 1.02), (1.01, 2.0)),  # overlap/boundary words
    ((0.0, 7200.0), (7200.0, 86400.0), (86400.0, 360000.0)),
    ((3598.875, 3600.125), (3600.125, 3602.875), (3610.0, 3615.0)),
]


WRAP_MODES = ("none", "sentence", "balanced")
EXPECTED_MATRIX_CASES = len(TEXT_FIXTURES) * len(TIMING_FIXTURES) * len(WRAP_MODES)


def _args(source, output_dir, formats="srt,vtt,ass,json", **overrides):
    values = {
        "input": str(source),
        "output_dir": str(output_dir),
        "formats": formats,
        "lang_suffix": False,
        "max_line_width": 80,
        "max_lines": 3,
        "wrap_mode": "sentence",
    }
    values.update(overrides)
    return types.SimpleNamespace(**values)


def _reexport(args):
    events = []
    original_emit = T.emit
    try:
        T.emit = lambda event, **payload: events.append((event, payload))
        T.reexport_from_json(args)
    finally:
        T.emit = original_emit
    done = [payload for event, payload in events if event == "done"]
    assert len(done) == 1, events
    return done[0]


def _clock_seconds(value, separator):
    match = re.fullmatch(
        rf"(\d+):(\d{{2}}):(\d{{2}}){re.escape(separator)}(\d{{2,3}})", value,
    )
    assert match, value
    hours, minutes, seconds, fraction = match.groups()
    scale = 100 if len(fraction) == 2 else 1000
    return int(hours) * 3600 + int(minutes) * 60 + int(seconds) + int(fraction) / scale


def _parse_srt_strict(raw):
    assert raw.startswith(b"\xef\xbb\xbf")
    text = raw.decode("utf-8-sig").replace("\r\n", "\n").replace("\r", "\n")
    blocks = [block for block in re.split(r"\n\s*\n", text.strip()) if block]
    rows = []
    for expected_id, block in enumerate(blocks, 1):
        lines = block.split("\n")
        assert lines[0] == str(expected_id), lines
        match = re.fullmatch(
            r"(\d+:\d{2}:\d{2},\d{3}) --> (\d+:\d{2}:\d{2},\d{3})", lines[1],
        )
        assert match, lines[1]
        rows.append((_clock_seconds(match.group(1), ","),
                     _clock_seconds(match.group(2), ","),
                     "\n".join(lines[2:])))
    return rows


def _parse_vtt_strict(raw):
    assert not raw.startswith(b"\xef\xbb\xbf")
    text = raw.decode("utf-8").replace("\r\n", "\n").replace("\r", "\n")
    assert text.startswith("WEBVTT\n\n")
    blocks = [block for block in re.split(r"\n\s*\n", text[len("WEBVTT\n\n"):].strip()) if block]
    rows = []
    for block in blocks:
        lines = block.split("\n")
        match = re.fullmatch(
            r"(\d+:\d{2}:\d{2}\.\d{3}) --> (\d+:\d{2}:\d{2}\.\d{3})"
            r"(?: [^\r\n]+)?", lines[0],
        )
        assert match, lines[0]
        rows.append((_clock_seconds(match.group(1), "."),
                     _clock_seconds(match.group(2), "."),
                     "\n".join(lines[1:])))
    return rows


def _parse_ass_independent(raw):
    assert raw.startswith(b"\xef\xbb\xbf")
    text = raw.decode("utf-8-sig").replace("\r\n", "\n").replace("\r", "\n")
    assert "[Script Info]" in text and "[V4+ Styles]" in text and "[Events]" in text
    rows = []
    for line in text.split("\n"):
        if not line.startswith("Dialogue:"):
            continue
        fields = line.split(":", 1)[1].lstrip().split(",", 9)
        assert len(fields) == 10, fields
        body = fields[9].replace("\\N", "\n").replace("\\n", "\n")
        body = re.sub(r"\{[^}]*\}", "", body).strip()
        rows.append((_clock_seconds(fields[1], "."),
                     _clock_seconds(fields[2], "."), body))
    return rows


def _rows_key(rows, precision=3):
    return [(round(start, precision), round(end, precision), text)
            for start, end, text in rows]


def _assert_format_contracts(paths, entry_count):
    srt_raw = paths["srt"].read_bytes()
    vtt_raw = paths["vtt"].read_bytes()
    ass_raw = paths["ass"].read_bytes()
    json_raw = paths["json"].read_bytes()

    srt_reader_a = _parse_srt_strict(srt_raw)
    srt_reader_b = T.parse_srt(srt_raw.decode("utf-8-sig"))
    assert _rows_key(srt_reader_a) == _rows_key(srt_reader_b), (
        _rows_key(srt_reader_a), _rows_key(srt_reader_b), paths["srt"],
    )

    vtt_reader_a = _parse_vtt_strict(vtt_raw)
    vtt_reader_b = T.parse_srt(vtt_raw.decode("utf-8"))
    assert _rows_key(vtt_reader_a) == _rows_key(vtt_reader_b), (
        _rows_key(vtt_reader_a), _rows_key(vtt_reader_b), paths["vtt"],
    )

    ass_reader_a = _parse_ass_independent(ass_raw)
    ass_reader_b = T.parse_ass(ass_raw.decode("utf-8-sig"))
    assert _rows_key(ass_reader_a, 2) == _rows_key(ass_reader_b, 2), (
        _rows_key(ass_reader_a, 2), _rows_key(ass_reader_b, 2), paths["ass"],
    )

    assert len(srt_reader_a) == entry_count
    assert len(vtt_reader_a) == entry_count
    assert len(ass_reader_a) == entry_count
    assert not vtt_raw.startswith(b"\xef\xbb\xbf")
    assert not json_raw.startswith(b"\xef\xbb\xbf")
    payload = json.loads(json_raw.decode("utf-8"))
    assert payload["version"] == 1
    assert [segment["id"] for segment in payload["segments"]] == list(
        range(1, entry_count + 1))


def _matrix_entries(timings, text):
    entries = []
    speakers = {0: "SPEAKER_00", 2: "SPEAKER_01"}
    for index, (start, end) in enumerate(timings):
        prefix = f"[{speakers[index]}] " if index in speakers else ""
        entries.append((start, end, f"{prefix}{text} / blok {index + 1}"))
    words = []
    for index, (start, end) in enumerate(timings):
        midpoint = start + max(0.0, end - start) / 2
        words.append({
            "word": f" w{index}", "start": round(midpoint, 4),
            "end": round(midpoint, 4), "probability": round(0.91 - index * 0.1, 2),
        })
    return entries, speakers, words


def test_golden_metamorphic_differential_matrix_324_cases():
    assert EXPECTED_MATRIX_CASES == 324
    cases_run = 0
    with tempfile.TemporaryDirectory() as td:
        root = Path(td)
        for text_index, (language, text) in enumerate(TEXT_FIXTURES):
            for timing_index, timings in enumerate(TIMING_FIXTURES):
                for wrap_mode in WRAP_MODES:
                    case_id = f"c{cases_run:03d}"
                    direct = root / case_id / "direct"
                    repeat_a = root / case_id / "repeat-a"
                    repeat_b = root / case_id / "repeat-b"
                    direct.mkdir(parents=True)
                    entries, speakers, words = _matrix_entries(timings, text)
                    probability = 0.0 if (text_index + timing_index) % 11 == 0 else 0.9876
                    info = T._WxInfo(language=language, language_probability=probability,
                                     duration=max(end for _start, end in timings))
                    T.set_language_conventions(language)
                    direct_paths = {
                        "srt": direct / f"{case_id}.srt",
                        "vtt": direct / f"{case_id}.vtt",
                        "ass": direct / f"{case_id}.ass",
                        "json": direct / f"{case_id}.json",
                    }
                    T.write_srt(entries, direct_paths["srt"], 80, 3,
                                language=language, wrap_mode=wrap_mode)
                    T.write_vtt(entries, direct_paths["vtt"], 80, 3,
                                language=language, wrap_mode=wrap_mode)
                    T.write_ass(entries, direct_paths["ass"], 80,
                                language=language, wrap_mode=wrap_mode, speakers=speakers)
                    T.write_json(entries, direct_paths["json"], info=info,
                                 speakers=speakers, all_words=words)

                    done_a = _reexport(_args(
                        direct_paths["json"], repeat_a, wrap_mode=wrap_mode,
                    ))
                    done_b = _reexport(_args(
                        direct_paths["json"], repeat_b, wrap_mode=wrap_mode,
                    ))
                    assert len(done_a["files"]) == 4 and len(done_b["files"]) == 4
                    for extension, direct_path in direct_paths.items():
                        first = repeat_a / f"{case_id}.{extension}"
                        second = repeat_b / f"{case_id}.{extension}"
                        assert first.read_bytes() == direct_path.read_bytes(), (
                            case_id, language, timing_index, wrap_mode, extension,
                        )
                        assert second.read_bytes() == first.read_bytes(), (
                            "determinism", case_id, extension,
                        )
                    _assert_format_contracts(direct_paths, len(entries))
                    cases_run += 1
    assert cases_run == EXPECTED_MATRIX_CASES
    print(f"  MATRIX  {cases_run} vaka × 4 format × direct + 2 re-export")


def test_mutation_oracles_reject_bom_escape_and_timestamp_faults():
    killed = 0
    with tempfile.TemporaryDirectory() as td:
        root = Path(td)
        srt = root / "mutation.srt"
        ass = root / "mutation.ass"
        T.write_srt([(59.9996, 60.5, "Metin")], srt, wrap_mode="none")
        T.write_ass([(0.0, 1.0, "Q:\\New")], ass, wrap_mode="none")

        mutations = [
            lambda: _parse_srt_strict(srt.read_bytes()[3:]),
            lambda: _parse_srt_strict(
                srt.read_bytes().replace(b"00:01:00,000", b"00:01:00.000", 1)),
            lambda: _assert_ass_path_escape(
                ass.read_bytes().replace("\\\u2060N".encode("utf-8"), b"\\N", 1)),
        ]
        for mutant in mutations:
            try:
                mutant()
            except AssertionError:
                killed += 1
    assert killed == len(mutations)
    print(f"  MUTATION  {killed}/{len(mutations)} mutant yakalandı")


def _assert_ass_path_escape(raw):
    body = _parse_ass_independent(raw)[0][2]
    assert "Q:\\⁠New" in body, body
    assert "Q:\\New" not in body, body


def test_reexport_dispatch_never_calls_transcription_ffmpeg_or_model_path():
    with tempfile.TemporaryDirectory() as td:
        root = Path(td)
        source = root / "dispatch.json"
        source.write_text(json.dumps({
            "language": "tr",
            "segments": [{"start": 0, "end": 1, "text": "Metin"}],
        }), encoding="utf-8")
        original_argv = sys.argv
        original_emit = T.emit
        original_transcribe = T.transcribe
        original_find_ffmpeg = T.find_ffmpeg
        original_extract_audio = T.extract_audio
        forbidden_calls = []

        def forbidden(name):
            def fail(*_args, **_kwargs):
                forbidden_calls.append(name)
                raise AssertionError(f"yasak yol çağrıldı: {name}")
            return fail

        try:
            sys.argv = [
                "transcribe.py", "--input", str(source), "--output-dir", str(root / "out"),
                "--formats", "srt", "--reexport", "true",
            ]
            T.emit = lambda *_args, **_kwargs: None
            T.transcribe = forbidden("transcribe")
            T.find_ffmpeg = forbidden("find_ffmpeg")
            T.extract_audio = forbidden("extract_audio")
            T.main()
        finally:
            sys.argv = original_argv
            T.emit = original_emit
            T.transcribe = original_transcribe
            T.find_ffmpeg = original_find_ffmpeg
            T.extract_audio = original_extract_audio
        assert forbidden_calls == []
        assert (root / "out" / "dispatch.srt").exists()


def test_invalid_export_extensions_remain_guarded():
    with tempfile.TemporaryDirectory() as td:
        root = Path(td)
        source = root / "input" / "guard.json"
        source.parent.mkdir()
        source.write_text(json.dumps({
            "language": "tr",
            "segments": [{"start": 0, "end": 1, "text": "Metin"}],
        }), encoding="utf-8")
        out = root / "out"
        done = _reexport(_args(
            source, out, formats="srt,wat,../ass,.txt,json.exe",
        ))
        assert [Path(path).suffix for path in done["files"]] == [".srt"]
        assert sorted(path.name for path in out.iterdir()) == ["guard.srt"]
        assert not any(path.name.endswith((".wat", ".exe")) for path in root.rglob("*"))


def test_old_schema_missing_words_diarization_and_sorting():
    with tempfile.TemporaryDirectory() as td:
        root = Path(td)
        source = root / "legacy.json"
        source.write_text(json.dumps({
            "segments": [
                {"start": 8, "end": 9, "text": "[SPEAKER_01] Geç", "speaker": "SPEAKER_01"},
                {"start": 1, "end": 2, "text": "[SPEAKER_00] Erken", "speaker": "SPEAKER_00"},
                {"start": "bad", "end": 3, "text": "atlanmalı"},
                {"start": 4, "end": 5, "text": "   "},
            ],
        }, ensure_ascii=False), encoding="utf-8")
        out = root / "out"
        _reexport(_args(source, out))
        srt_rows = _parse_srt_strict((out / "legacy.srt").read_bytes())
        ass_rows = _parse_ass_independent((out / "legacy.ass").read_bytes())
        payload = json.loads((out / "legacy.json").read_text(encoding="utf-8"))
        assert [row[0] for row in srt_rows] == [1.0, 8.0]
        assert [row[2] for row in ass_rows] == ["Erken", "Geç"]
        assert payload["language"] == "tr" and payload["language_probability"] == 1.0
        assert all("words" not in segment for segment in payload["segments"])


def test_vtt_settings_are_readable_but_writer_does_not_invent_them():
    with tempfile.TemporaryDirectory() as td:
        target = Path(td) / "settings.vtt"
        T.write_vtt([(1.0, 2.0, "Metin")], target, wrap_mode="none")
        raw = target.read_bytes()
        assert b"align:" not in raw and b"position:" not in raw
        enriched = raw.replace(
            b"00:00:01.000 --> 00:00:02.000",
            b"00:00:01.000 --> 00:00:02.000 align:start position:10%",
        )
        reader_a = _parse_vtt_strict(enriched)
        reader_b = T.parse_srt(enriched.decode("utf-8"))
        assert _rows_key(reader_a) == _rows_key(reader_b)


def _run():
    tests = [value for name, value in sorted(globals().items())
             if name.startswith("test_") and callable(value)]
    passed = 0
    failed = 0
    for test in tests:
        try:
            test()
            print(f"  PASS  {test.__name__}")
            passed += 1
        except Exception as exc:
            print(f"  FAIL  {test.__name__}: {type(exc).__name__}: {exc}")
            failed += 1
    print(f"\n{passed} geçti, {failed} başarısız ({len(tests)} test; "
          f"{EXPECTED_MATRIX_CASES} matris vakası)")
    return failed == 0


if __name__ == "__main__":
    sys.exit(0 if _run() else 1)
