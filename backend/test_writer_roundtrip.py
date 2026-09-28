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
from test_golden_writers import ENTRIES, SPEAKERS  # noqa: E402


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
        for (gs, ge, _gt), (s, e, _t) in zip(got, ENTRIES):
            # ASS santisaniye çözünürlüğü: ms kenarı ±10ms
            self.assertAlmostEqual(gs, s, delta=0.01)
            self.assertAlmostEqual(ge, e, delta=0.01)

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
        T.write_dual_srt(ENTRIES, ENTRIES, path, wrap_mode="none")
        got = read_back(path, "srt")
        self.assertEqual(len(got), len(ENTRIES))
        for (gs, ge, gtext), (s, e, text) in zip(got, ENTRIES):
            self.assertEqual((gs, ge), (s, e))
            lines = [ln for ln in gtext.split("\n") if ln.strip()]
            self.assertEqual(len(lines), 2, "dual cue üst=çeviri alt=kaynak 2 satır taşımalı")
            self.assertTrue(all(ln.strip() == text for ln in lines))

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
