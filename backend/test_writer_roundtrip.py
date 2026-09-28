"""R209 — yazıcı → ayrıştırıcı roundtrip sadakat kilidi.

golden-writers fixture'ı çıktı BYTES'ını kilitliyor; bu test o bytes'ın gerçek
okuma yolu (`read_subtitle_text` + `parse_subtitle_entries`) üzerinden tekrar
ayrıştırıldığında cue'nun (start, end, metin) kayıpsız döndüğünü kanıtlar —
yazıcı/okuyucu sözleşme drift'i erken yakalanır.
"""
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import transcribe as T  # noqa: E402
from test_golden_writers import DUAL_TRANSLATED, ENTRIES, GOLDEN_DIR, SPEAKERS  # noqa: E402


def read_back(path, suffix):
    text, _encoding, _repaired = T.read_subtitle_text(Path(path))
    return T.parse_subtitle_entries(text, suffix=suffix)


class WriterRoundtripTests(unittest.TestCase):

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def test_srt_roundtrip_preserves_times_and_wrapped_text(self):
        path = self.dir / "film.srt"
        T.write_srt(ENTRIES, path, wrap_mode="none")
        got = read_back(path, "srt")
        self.assertEqual([(s, e, t) for s, e, t in got],
                         [(s, e, t) for s, e, t in ENTRIES],
                         "wrap_mode=none SRT roundtrip (start,end,metin) birebir kalmalı")

    def test_srt_sentence_wrap_rejoins_to_original_text(self):
        path = self.dir / "wrapped.srt"
        T.write_srt(ENTRIES, path, wrap_mode="sentence")
        got = read_back(path, "srt")
        self.assertEqual(len(got), len(ENTRIES))
        for (gs, ge, gtext), (s, e, text) in zip(got, ENTRIES):
            self.assertEqual((gs, ge), (s, e))
            # sarma yalnız satır sonu ekler — boşluk-normalleştirilmiş metin aynı
            self.assertEqual(" ".join(gtext.split()), " ".join(text.split()))

    def test_vtt_roundtrip_preserves_cues(self):
        path = self.dir / "film.vtt"
        T.write_vtt(ENTRIES, path, wrap_mode="none")
        got = read_back(path, "vtt")
        self.assertEqual([(s, e, t) for s, e, t in got],
                         [(s, e, t) for s, e, t in ENTRIES],
                         "WEBVTT başlığı ve nokta-damga formatı roundtrip'i bozmamalı")

    def test_ass_roundtrip_preserves_times_and_clean_text(self):
        path = self.dir / "film.ass"
        T.write_ass(ENTRIES, path, speakers=SPEAKERS)
        got = read_back(path, "ass")
        self.assertEqual(len(got), len(ENTRIES))
        for (gs, ge, gtext), (s, e, text) in zip(got, ENTRIES):
            # ASS santisaniye çözünürlüğü: ms kenarı ±10ms
            self.assertAlmostEqual(gs, s, delta=0.01)
            self.assertAlmostEqual(ge, e, delta=0.01)
        # Kaçışsız ilk 3 cue'nun metni de roundtrip'ten geçmeli (ASS writer
        # cümle sınırında \N kırar; parse tarafı bunu metin olarak korur)
        for (gs, ge, gtext), (s, e, text) in zip(got[:3], ENTRIES[:3]):
            self.assertEqual(" ".join(gtext.replace("\\N", " ").split()),
                             " ".join(text.split()))

    def test_ass_escape_transforms_survive_parse_untouched(self):
        path = self.dir / "esc.ass"
        T.write_ass(ENTRIES, path, speakers=SPEAKERS)
        raw = path.read_text(encoding="utf-8-sig")
        # 4. cue `C:\Notlar\altın.txt` + `{italik}` — writer kaçışları dosyada kalmalı
        self.assertIn("\\\u2060Notlar", raw)
        self.assertIn("｛italik｝", raw)
        got = read_back(path, "ass")
        self.assertEqual(len(got), len(ENTRIES))
        # Ayrıştırıcı kaçış dizilerini geri açmak zorunda değil; cue kaybolmamalı
        self.assertFalse(any("\\u2060" in t for _s, _e, t in got))

    def test_dual_srt_roundtrip_keeps_both_languages_per_cue(self):
        path = self.dir / "dual.srt"
        # Kaynak ve çeviri FARKLI metinler — taraf sırası tersine dönerse
        # veya aynı liste iki kez yazılırsa test yakalar.
        T.write_dual_srt(ENTRIES, DUAL_TRANSLATED, path, wrap_mode="none")
        got = read_back(path, "srt")
        self.assertEqual(len(got), len(ENTRIES))
        for (gs, ge, gtext), (s, e, text), (_ts, _te, tr) in zip(got, ENTRIES, DUAL_TRANSLATED):
            self.assertEqual((gs, ge), (s, e))
            lines = [ln for ln in gtext.split("\n") if ln.strip()]
            self.assertEqual(len(lines), 2, "dual cue üst=çeviri alt=kaynak 2 satır taşımalı")
            self.assertEqual(lines[0].strip(), tr, "üst satır çeviri")
            self.assertEqual(lines[1].strip(), text, "alt satır kaynak")

    def test_recorded_golden_fixtures_parse_lossless(self):
        # Kayıtlı fixture'ların kendisi de gerçek okuma yolundan ayrıştırılır —
        # golden kümesi ile roundtrip testi birbirini karşıt kılıyor.
        for name, suffix in (("basic.srt", "srt"), ("basic.vtt", "vtt"), ("basic.ass", "ass")):
            text, _enc, _rep = T.read_subtitle_text(GOLDEN_DIR / name)
            got = T.parse_subtitle_entries(text, suffix=suffix)
            self.assertEqual(
                len(got), len(ENTRIES),
                f"{name} kayıtlı fixture {len(ENTRIES)} cue'ya ayrıştırılamadı")
            for (gs, ge, gtext), (s, e, src_text) in zip(got, ENTRIES):
                self.assertAlmostEqual(gs, s, delta=0.01)
                self.assertAlmostEqual(ge, e, delta=0.01)
                # Metin de korunmalı: ayrıştırılmış metin çok-satırlı cue'da
                # gerçek satır sonu taşır; boşluk-normalize karşılaştırma
                # iki tarafı da katlar. ASS bilinçli atlanır: writer'ın
                # kaçış dönüşümü (⁠/｛｝) tek yönlü — ayrıştırıcı geri
                # açmak zorunda değil (test_ass_escape_* ile belgeli).
                if suffix == "ass":
                    continue
                self.assertEqual(
                    " ".join(gtext.split()),
                    " ".join(src_text.split()),
                    f"{name} cue metni kayıtlı fixture'dan geri okunamadı")
        dual_got = T.parse_subtitle_entries(
            T.read_subtitle_text(GOLDEN_DIR / "dual.srt")[0], suffix="srt")
        self.assertEqual(len(dual_got), len(ENTRIES))
        # dual.srt her cue'da üstte çeviri (büyük harf), altta kaynak taşır —
        # satır içerikleri de kilitlenir, yalnız cue sayısı değil.
        for (_gs, _ge, gtext), (_s, _e, src_text) in zip(dual_got, ENTRIES):
            lines = [ln.strip() for ln in gtext.split("\n") if ln.strip()]
            self.assertEqual(len(lines), 2, "dual cue iki satır taşımalı")
            self.assertEqual(lines[0], src_text.upper(), "üst satır çeviri değil")
            self.assertEqual(lines[1], src_text, "alt satır kaynak değil")

    def test_json_output_reloads_as_identical_segment_list(self):
        path = self.dir / "film.json"
        T.write_json(ENTRIES, path)
        data = json.loads(path.read_text(encoding="utf-8"))
        self.assertEqual(len(data["segments"]), len(ENTRIES))
        for seg, (s, e, text) in zip(data["segments"], ENTRIES):
            self.assertAlmostEqual(seg["start"], s, delta=0.001)
            self.assertAlmostEqual(seg["end"], e, delta=0.001)
            self.assertEqual(seg["text"], text)


if __name__ == "__main__":
    unittest.main()
