"""Timing/split/offset motor parity için deterministik property paketi.

Electron, ağ, GPU veya model başlatmaz. 50.000 üretilmiş segment/word dizisini
faster, faster-batched ve WhisperX uyarlayıcılarından aynı saf hatta geçirir.
"""

from __future__ import annotations

import json
import math
import os
from pathlib import Path
import random
import sys
import tempfile
import time
import types


sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import transcribe as T  # noqa: E402


SEED = 330033
CASES = 50_000


class Word:
    def __init__(self, word, start, end, probability=1.0):
        self.word = word
        self.start = start
        self.end = end
        self.probability = probability


class Segment:
    def __init__(self, start, end, text, words):
        self.start = start
        self.end = end
        self.text = text
        self.words = words


def _compact(text):
    return "".join((text or "").split())


def _assert_close(a, b, tolerance=1e-9, context=""):
    if abs(a - b) > tolerance:
        raise AssertionError(f"{context}: {a!r} != {b!r}")


def _args(mode):
    return types.SimpleNamespace(
        split_mode=mode,
        hard_max_chars=64,
        max_chars=36,
        timing_gap=0.35,
    )


def _make_case(rng, index):
    lexicon = ["Merhaba", "dünya", "ve", "sonra,", "bitti.", "مرحبا", "🙂", "uzun"]
    count = rng.randint(1, 10)
    cursor = rng.uniform(0.0, 0.2)
    rows = []
    for word_index in range(count):
        cursor += rng.uniform(0.0, 0.45)
        start = cursor
        end = start + rng.uniform(0.02, 0.7)
        cursor = end
        token = rng.choice(lexicon)
        if word_index == count - 1 and index % 3 == 0 and token[-1:] not in T.PUNCT_END:
            token += "."
        probability = rng.choice([0.0, 0.2, 0.75, 1.0])
        raw_start = None if (index + word_index) % 17 == 0 else start
        raw_end = None if (index * 3 + word_index) % 23 == 0 else end
        if index % 997 == 0 and word_index == 0:
            raw_start = float("nan")
        rows.append((token, raw_start, raw_end, probability))

    text = " ".join(row[0] for row in rows)
    finite = [v for row in rows for v in row[1:3] if v is not None and math.isfinite(v)]
    seg_start = max(0.0, min(finite, default=0.0) - 0.1)
    seg_end = max(finite, default=seg_start) + 0.1
    if index % 1291 == 0:
        seg_end = float("inf")
    return seg_start, seg_end, text, rows


def run_generated_matrix():
    rng = random.Random(SEED)
    offsets = (0.0, 0.375, 3600.0)
    modes = ("none", "sentence", "timing", "smart")
    generated_words = 0

    for index in range(CASES):
        seg_start, seg_end, text, rows = _make_case(rng, index)
        generated_words += len(rows)
        faster_words = [Word(" " + token, start, end, probability) for token, start, end, probability in rows]
        batched_words = [Word(" " + token, start, end, probability) for token, start, end, probability in rows]
        faster = Segment(seg_start, seg_end, text, faster_words)
        batched = Segment(seg_start, seg_end, text, batched_words)
        whisperx = T._wrap_whisperx_segment({
            "start": seg_start,
            "end": seg_end,
            "text": text,
            "words": [
                {"word": token, "start": start, "end": end, "score": probability}
                for token, start, end, probability in rows
            ],
        })
        args = _args(modes[index % len(modes)])
        offset = offsets[index % len(offsets)]
        finite_end = max(
            [v for row in rows for v in row[1:3] if v is not None and math.isfinite(v)],
            default=0.0,
        )
        duration = max(0.1, finite_end + 0.2)

        results = [
            T.segment_timeline_chunks(
                engine_segment,
                args,
                language="tr",
                time_offset=offset,
                media_duration=duration,
            )
            for engine_segment in (faster, batched, whisperx)
        ]
        axes = [(chunks, words) for _segment, chunks, words in results]
        if not (axes[0] == axes[1] == axes[2]):
            raise AssertionError(f"motor parity case={index} rows={rows!r} axes={axes!r}")

        normalized_segment, shifted_chunks, shifted_words = results[0]
        if _compact(" ".join(chunk[2] for chunk in shifted_chunks)) != _compact(text):
            raise AssertionError(f"metin kaybı case={index} text={text!r} chunks={shifted_chunks!r}")
        for start, end, _text in shifted_chunks:
            if not (math.isfinite(start) and math.isfinite(end) and offset <= start <= end <= offset + duration):
                raise AssertionError(f"cue ekseni case={index}: {(start, end)!r}")
        for word in shifted_words:
            if not (math.isfinite(word["start"]) and math.isfinite(word["end"])
                    and offset <= word["start"] <= word["end"] <= offset + duration):
                raise AssertionError(f"word ekseni case={index}: {word!r}")

        _local_segment, local_chunks, local_words = T.segment_timeline_chunks(
            faster, args, language="tr", time_offset=0.0, media_duration=duration,
        )
        for local, shifted in zip(local_chunks, shifted_chunks):
            _assert_close(shifted[0] - local[0], offset, context=f"cue start offset case={index}")
            _assert_close(shifted[1] - local[1], offset, context=f"cue end offset case={index}")
        for local, shifted in zip(local_words, shifted_words):
            _assert_close(shifted["start"] - local["start"], offset, tolerance=1e-6,
                          context=f"word start offset case={index}")
            _assert_close(shifted["end"] - local["end"], offset, tolerance=1e-6,
                          context=f"word end offset case={index}")

        normalized = T.normalize_timings(
            shifted_chunks,
            min_dur=0.2,
            max_dur=4.0,
            min_gap=0.04,
            max_cps=24.0,
            media_start=offset,
            media_end=offset + duration,
        )
        normalized_twice = T.normalize_timings(
            normalized,
            min_dur=0.2,
            max_dur=4.0,
            min_gap=0.04,
            max_cps=24.0,
            media_start=offset,
            media_end=offset + duration,
        )
        if normalized != normalized_twice:
            raise AssertionError(
                f"normalize idempotence case={index} once={normalized!r} twice={normalized_twice!r}"
            )
        for cue_index, (start, end, _text) in enumerate(normalized):
            if not (offset <= start <= end <= offset + duration):
                raise AssertionError(f"normalize sınırı case={index}: {(start, end)!r}")
            if cue_index + 1 < len(normalized) and end > normalized[cue_index + 1][0]:
                raise AssertionError(f"normalize overlap case={index}: {normalized!r}")

    return generated_words


def run_cross_format_axis():
    entries = []
    words = []
    cursor = 3600.125
    for index in range(1000):
        start = cursor + index * 1.25
        end = start + 0.875
        entries.append((start, end, f"Satır {index}."))
        words.append({"word": f" Satır{index}", "start": start + 0.1, "end": start + 0.5,
                      "probability": 0.75})

    with tempfile.TemporaryDirectory() as temp_dir:
        root = Path(temp_dir)
        paths = {suffix: root / f"axis.{suffix}" for suffix in ("srt", "vtt", "ass", "json")}
        T.write_srt(entries, paths["srt"], wrap_mode="sentence")
        T.write_vtt(entries, paths["vtt"], wrap_mode="sentence")
        T.write_ass(entries, paths["ass"], wrap_mode="sentence")
        T.write_json(entries, paths["json"], all_words=words)

        parsed = {
            "srt": T.parse_srt(paths["srt"].read_text(encoding="utf-8-sig")),
            "vtt": T.parse_srt(paths["vtt"].read_text(encoding="utf-8")),
            "ass": T.parse_subtitle_entries(paths["ass"].read_text(encoding="utf-8-sig"), ".ass"),
        }
        data = json.loads(paths["json"].read_text(encoding="utf-8"))
        parsed["json"] = [(row["start"], row["end"], row["text"]) for row in data["segments"]]

        for name, rows in parsed.items():
            if len(rows) != len(entries):
                raise AssertionError(f"{name} cue kaybı: {len(rows)} != {len(entries)}")
            tolerance = 0.006 if name == "ass" else 0.0011
            for expected, actual in zip(entries, rows):
                _assert_close(expected[0], actual[0], tolerance, context=f"{name} start")
                _assert_close(expected[1], actual[1], tolerance, context=f"{name} end")


def run_wrap_corpus():
    corpus = (
        "Merhaba dünya. Sonra görüşürüz!",
        "你好。世界。再见。",
        "مرحبا بالعالم. إلى اللقاء!",
        "- Geldin mi? - Evet.",
        "... !!! ???",
        "Merhaba 🙂. Güle güle 👋!",
        "çokuzun" * 20,
    )
    for text in corpus:
        for mode in ("none", "sentence", "balanced"):
            wrapped = T.wrap_text(text, max_line_width=18, max_lines=3, wrap_mode=mode)
            if _compact(wrapped) != _compact(text):
                raise AssertionError(f"wrap metin kaybı mode={mode}: {text!r} -> {wrapped!r}")

    cjk = T.wrap_text(corpus[1], max_lines=3, wrap_mode="sentence")
    if cjk != "你好。\n世界。\n再见。":
        raise AssertionError(f"CJK cümle sınırı görünmedi: {cjk!r}")


def main():
    started = time.perf_counter()
    generated_words = run_generated_matrix()
    run_cross_format_axis()
    run_wrap_corpus()
    elapsed = time.perf_counter() - started
    print(
        f"PASS seed={SEED} arrays={CASES} words={generated_words} "
        f"formats=4 format_cues=1000 elapsed={elapsed:.3f}s"
    )


if __name__ == "__main__":
    main()
