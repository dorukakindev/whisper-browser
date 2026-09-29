"""ASS/SSA override-etiketi roundtrip sadakat kilidi.

Çeviri/yeniden-yazım hattında yalnız üç etiketin taşınması KASITLIdır:
konum (\\anN, \\pos) ve satırın tamamını kapsayan italik (\\i1). Karaoke
(\\k), geçiş (\\fad/\\fade), hareket (\\move), yazı tipi/renk/boyut
(\\fn/\\c/\\fs), dönüşüm (\\t) gibi etiketler kaynak süreçlerle bağlı olduğu
için çeviri çıktısına taşınmaz — bu test düşmeyi de kilitler (sessiz gerileme
olmaz, politikası belgeli kalır).
"""

import os
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import transcribe as T  # noqa: E402


def _roundtrip(ass_text, fmt="ass"):
    """parse → boş-cue süzgeci → decorations → write_* zincirinin tamamı.

    Kapsam notu: çevirinin kendisi ve metin-değiştiren geçişler (merge_continuation,
    dedupe_cues, LLM onarımı) bu zincirin DIŞINDAdır — o yolların indeks-kayması
    sözleşmesi test_merge_and_dedupe_reset_formats ile ayrıca kilitlenir."""
    entries = T.parse_subtitle_entries(ass_text, "ass")
    formats = T.parse_ass_cue_formats(ass_text)
    assert len(formats) == len(entries)
    entries, formats, _dropped = T.drop_empty_entries(entries, formats)
    decorations = T.cue_format_decorations(formats, fmt)
    with tempfile.TemporaryDirectory() as td:
        target = Path(td) / f"out.{fmt}"
        if fmt == "ass":
            T.write_ass(entries, target, max_line_width=500,
                        wrap_mode="balanced", overrides=decorations)
        elif fmt == "srt":
            T.write_srt(entries, target, max_line_width=500,
                        wrap_mode="balanced", decorations=decorations)
        else:
            T.write_vtt(entries, target, max_line_width=500,
                        wrap_mode="balanced", decorations=decorations)
        return target.read_text(encoding="utf-8-sig")


def _dialogue_texts(raw):
    return [ln.split(",", 9)[9] for ln in raw.splitlines()
            if ln.startswith("Dialogue:")]


def test_leading_align_pos_italic_survive_ass():
    src = """[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:01.00,0:00:03.00,Default,,0,0,0,,{\\an8}Tabela satırı
Dialogue: 0,0:00:04.00,0:00:06.00,Default,,0,0,0,,{\\pos(320,40)}Konumlu
Dialogue: 0,0:00:07.00,0:00:09.00,Default,,0,0,0,,{\\i1}İç ses tamamen
Dialogue: 0,0:00:10.00,0:00:12.00,Default,,0,0,0,,{\\an8\\pos(100,200)\\i1}Hepsi birden
Dialogue: 0,0:00:13.00,0:00:15.00,Default,,0,0,0,,Düz satır
"""
    out = _roundtrip(src, "ass")
    texts = _dialogue_texts(out)
    assert len(texts) == 5
    assert texts[0].startswith("{\\an8}"), texts[0]
    assert texts[1].startswith("{\\pos(320,40)}"), texts[1]
    assert texts[2].startswith("{\\i1}"), texts[2]
    assert texts[3].startswith("{\\an8\\pos(100,200)\\i1}"), texts[3]
    assert texts[4] == "Düz satır", texts[4]


def test_srt_top_align_and_italic_only():
    src = """[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:01.00,0:00:03.00,Default,,0,0,0,,{\\an8\\pos(320,40)}Tabela
Dialogue: 0,0:00:04.00,0:00:06.00,Default,,0,0,0,,{\\i1}İç ses
Dialogue: 0,0:00:07.00,0:00:09.00,Default,,0,0,0,,{\\an5}Orta-sol
"""
    out = _roundtrip(src, "srt")
    cues = [c.strip().splitlines()[-1] for c in out.strip().split("\n\n") if "-->" in c]
    # Üst hizalama {\\an8} SRT'de korunur (VLC/mpv destekli); \\pos SRT'de yok.
    assert cues[0].startswith("{\\an8}"), cues[0]
    assert "\\pos" not in cues[0]
    assert cues[1].startswith("<i>") and cues[1].endswith("</i>"), cues[1]
    # \\an5 üst değil — SRT'de taşınmaz (VLC \\an5'i yoksayar).
    assert cues[2] == "Orta-sol", cues[2]


def test_vtt_italic_only():
    src = """[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:01.00,0:00:03.00,Default,,0,0,0,,{\\an8\\pos(320,40)}Tabela
Dialogue: 0,0:00:04.00,0:00:06.00,Default,,0,0,0,,{\\i1}İç ses
"""
    out = _roundtrip(src, "vtt")
    assert "{\\an8}" not in out and "\\pos" not in out
    assert "<i>İç ses</i>" in out, out


def test_karaoke_fade_move_font_drop_everywhere():
    src = """[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:01.00,0:00:03.00,Default,,0,0,0,,{\\k40\\kf20}Karaoke kelime
Dialogue: 0,0:00:04.00,0:00:06.00,Default,,0,0,0,,{\\fad(200,300)\\move(100,100,200,200)}Hareketli
Dialogue: 0,0:00:07.00,0:00:09.00,Default,,0,0,0,,{\\fnComic Sans MS\\fs72\\c&HFF0000&}Süslü
Dialogue: 0,0:00:10.00,0:00:12.00,Default,,0,0,0,,{\\t(\\fs80)\\b1\\frz90}Dönüşümlü
"""
    for fmt in ("ass", "srt", "vtt"):
        out = _roundtrip(src, fmt)
        for tag in ("\\k40", "\\kf", "\\fad", "\\move", "\\fn", "\\fs72",
                    "\\c&H", "\\t(", "\\b1", "\\frz"):
            assert tag not in out, (fmt, tag, out)


def test_midline_and_late_tags_not_promoted():
    # \i1 satır-ortasında — tüm satırı kapsamıyor; italik süsleme uydurulamaz.
    src = """[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:01.00,0:00:03.00,Default,,0,0,0,,Başlangıç {\\i1}sonra{\\i0} bitti
Dialogue: 0,0:00:04.00,0:00:06.00,Default,,0,0,0,,{\\i1}İtalik sonra {\\i0}düz
"""
    formats = T.parse_ass_cue_formats(src)
    assert formats[0]["italic"] is False
    # {\i1} leading ama gövdede \i0 var → italik taşınmaz (yanlış kapsam).
    assert formats[1]["italic"] is False
    out = _roundtrip(src, "ass")
    assert "\\i1" not in out, out


def test_empty_tag_only_cue_dropped_and_alignment_kept():
    # Yalnız etiket taşıyan satır düşürülür; sonraki satırın \\an8'i kaymamalı.
    src = """[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:01.00,0:00:02.00,Default,,0,0,0,,{\\fad(0,200)}
Dialogue: 0,0:00:03.00,0:00:05.00,Default,,0,0,0,,{\\an8}İkinci satır
Dialogue: 0,0:00:06.00,0:00:08.00,Default,,0,0,0,,Üçüncü
"""
    entries = T.parse_subtitle_entries(src, "ass")
    formats = T.parse_ass_cue_formats(src)
    entries, formats, dropped = T.drop_empty_entries(entries, formats)
    assert dropped == 1
    assert len(entries) == 2 and len(formats) == 2
    assert formats[0]["align"] == 8 and formats[1]["align"] is None
    out = _roundtrip(src, "ass")
    texts = _dialogue_texts(out)
    assert texts[0].startswith("{\\an8}İkinci"), texts


def test_ssa_format_line_and_pos_validation():
    # SSA "Marked" alanlı Format satırı da sürüklenebilir.
    src = """[Events]
Format: Marked, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: Marked=0,0:00:01.00,0:00:03.00,Default,,0,0,0,,{\\an8}SSA satırı
"""
    entries = T.parse_subtitle_entries(src, "ssa")
    assert len(entries) == 1
    formats = T.parse_ass_cue_formats(src)
    assert formats[0]["align"] == 8
    # Bozuk \\pos değeri decorations'a sızmaz.
    bad = """[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:01.00,0:00:03.00,Default,,0,0,0,,{\\pos(abc,def)}Bozuk
"""
    formats = T.parse_ass_cue_formats(bad)
    assert formats[0]["pos"] is None
    out = _roundtrip(bad, "ass")
    assert "\\pos" not in out


def test_time_corrupt_dialogue_lines_align():
    # parse_ass ve parse_ass_cue_formats aynı satırları atar — eşleme kaymaz.
    src = """[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,bozuk,0:00:03.00,Default,,0,0,0,,{\\an8}Zamanı bozuk
Dialogue: 0,0:00:04.00,0:00:06.00,Default,,0,0,0,,{\\pos(50,60)}Sağlam
"""
    entries = T.parse_ass(src)
    formats = T.parse_ass_cue_formats(src)
    assert len(entries) == len(formats) == 1
    assert formats[0]["pos"] == ("50", "60")


def test_merge_and_dedupe_reset_formats():
    # Cümle birleştirme: "…" ile biten cue devam sayılır → iki cue birleşir,
    # indeks eşlemesi bozulur → çeviri yolundaki sözleşme gereği biçim sıfırlanır.
    src = """[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:01.00,0:00:03.00,Default,,0,0,0,,{\\an8}Görünür tabelada yazıyor ki…
Dialogue: 0,0:00:03.10,0:00:05.00,Default,,0,0,0,,sadece bir isim var.
"""
    entries = T.parse_subtitle_entries(src, "ass")
    formats = T.parse_ass_cue_formats(src)
    assert len(entries) == len(formats) == 2
    merged = T.merge_continuation_lines(entries)
    assert len(merged) == 1  # devam satırı önceki bloğa katıldı
    # Çeviri yolu sözleşmesi: sayı değiştiyse biçim güvenle eşlenemez → []
    merged_formats = formats if len(merged) == len(entries) else []
    assert merged_formats == []

    # Tekilleştirme: aynı metinli örtüşen cue elenir → indeks eşlemesi bozulur → []
    src2 = """[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:01.00,0:00:03.00,Default,,0,0,0,,{\\an8}Aynı satır
Dialogue: 0,0:00:01.05,0:00:03.00,Default,,0,0,0,,Aynı satır
"""
    entries2 = T.parse_subtitle_entries(src2, "ass")
    formats2 = T.parse_ass_cue_formats(src2)
    assert len(entries2) == len(formats2) == 2
    deduped_entries, removed = T.canonicalize_subtitle_entries(entries2)
    assert removed >= 1 and len(deduped_entries) < len(entries2)
    deduped_formats = formats2 if len(deduped_entries) == len(entries2) else []
    assert deduped_formats == []


if __name__ == "__main__":
    import traceback
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    passed = 0
    for fn in tests:
        try:
            fn()
            passed += 1
            print(f"  PASS {fn.__name__}")
        except Exception:
            print(f"  FAIL {fn.__name__}")
            traceback.print_exc()
    print(f"{passed} geçti, {len(tests) - passed} başarısız ({len(tests)} test)")
    sys.exit(0 if passed == len(tests) else 1)
