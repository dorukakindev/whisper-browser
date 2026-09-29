"""Tur 4 çekirdek düzeltmelerinin regresyon kilitleri (altyazı okuma/yazma, çeviri
satır sonu, çıktı işlemi kurtarması). Ağır bağımlılık gerektirmez."""
import io
import json
import os
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import pipeline_control as P  # noqa: E402
import sentence_translation as S  # noqa: E402
import transcribe as T  # noqa: E402


def _quiet(fn, *args, **kwargs):
    with redirect_stdout(io.StringIO()):
        return fn(*args, **kwargs)


class SubtitleReadWriteTests(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp())

    def test_blank_line_inside_srt_cue_does_not_break_strict_writer(self):
        entries = T.parse_subtitle_entries(
            "1\n00:00:01,000 --> 00:00:02,000\nLine one\n\nLine two\n\n"
            "2\n00:00:03,000 --> 00:00:04,000\nNext\n", ".srt")
        self.assertEqual(entries[0][2], "Line one\nLine two")
        out = self.dir / "a.srt"
        T.write_srt_raw(entries, out)  # eskiden RuntimeError: 2 cue beklendi, 3 blok
        self.assertIn("Line one\nLine two\n\n2\n", out.read_text(encoding="utf-8-sig"))

    def test_zero_duration_cue_gets_valid_end_without_passing_next_cue(self):
        entries = T.parse_subtitle_entries(
            "1\n00:00:01,000 --> 00:00:01,000\nA\n\n2\n00:00:01,400 --> 00:00:03,000\nB\n", ".srt")
        self.assertEqual(entries[0][:2], (1.0, 1.4))
        T.write_srt_raw(entries, self.dir / "b.srt")  # eskiden "cue zamanı geçersiz"

    def test_vtt_note_block_is_not_cue_text(self):
        entries = T.parse_subtitle_entries(
            "WEBVTT\n\n00:01.000 --> 00:02.000\nHello.\n\nNOTE translator comment\n\n"
            "00:03.000 --> 00:04.000\nBye.\n", ".vtt")
        self.assertEqual([text for _s, _e, text in entries], ["Hello.", "Bye."])

    def test_empty_ass_cues_are_dropped_with_their_formats(self):
        entries = [(1.0, 2.0, "Hi."), (3.0, 4.0, ""), (5.0, 6.0, "Bye.")]
        formats = [{"align": 8}, {"align": None}, {"align": 2}]
        kept, kept_formats, dropped = T.drop_empty_entries(entries, formats)
        self.assertEqual(dropped, 1)
        self.assertEqual([t for _s, _e, t in kept], ["Hi.", "Bye."])
        self.assertEqual(kept_formats, [{"align": 8}, {"align": 2}])

    def test_strict_writer_still_rejects_empty_cue(self):
        # Tasarım sözleşmesi: boş cue yazıcıya ulaşmadan düşürülür; yazıcı katı kalır.
        with self.assertRaises(RuntimeError):
            T.serialize_srt_strict([(1.0, 2.0, "")])

    def test_dual_srt_maps_by_index_when_counts_match(self):
        src = [(0, 4, "Where are you going?"), (1, 3, "(radio) Unit five respond."), (5, 6, "Home.")]
        tr = [(0, 4, "Nereye gidiyorsun?"), (1, 3, "(telsiz) Beşinci birim cevap ver."), (5, 6, "Eve.")]
        out = self.dir / "dual.srt"
        T.write_dual_srt(src, tr, out)
        blocks = out.read_text(encoding="utf-8-sig").strip().split("\n\n")
        self.assertTrue(blocks[0].endswith("Where are you going?"), blocks[0])
        self.assertTrue(blocks[1].endswith("(radio) Unit five respond."), blocks[1])
        self.assertEqual(sum(block.count("Unit five") for block in blocks), 1)

    def test_vtt_writer_escapes_markup_and_arrows(self):
        out = self.dir / "a.vtt"
        T.write_vtt([(1.0, 2.0, "I <3 you & me"), (3.0, 4.0, "a --> b")], out, wrap_mode="none",
                    decorations=[("<i>", "</i>"), ("", "")])
        text = out.read_text(encoding="utf-8")
        self.assertIn("<i>I &lt;3 you &amp; me</i>", text)
        self.assertIn("a --&gt; b", text)
        self.assertEqual(text.count("-->"), 2)  # yalnız iki zaman satırı

    def test_clean_text_keeps_angle_brackets_that_are_not_tags(self):
        self.assertEqual(T.clean_text("I <3 you & a < b > c"), "I <3 you & a < b > c")
        self.assertEqual(T.clean_text("<i>Merhaba</i>"), "Merhaba")

    def test_write_json_assigns_boundary_word_to_one_segment(self):
        words = [{"word": " Hello", "start": 0.2, "end": 0.5}, {"word": " there.", "start": 0.55, "end": 0.99},
                 {"word": " Next", "start": 1.02, "end": 1.3}, {"word": " one.", "start": 1.35, "end": 1.8}]
        out = self.dir / "w.json"
        T.write_json([(0.2, 1.0, "Hello there."), (1.0, 1.8, "Next one.")], out, all_words=words)
        segments = json.loads(out.read_text(encoding="utf-8"))["segments"]
        self.assertEqual([[w["word"] for w in s["words"]] for s in segments],
                         [[" Hello", " there."], [" Next", " one."]])


class LineBreakTests(unittest.TestCase):
    def tearDown(self):
        S.set_target_language("")

    def test_turkish_ordinal_is_not_a_sentence_break(self):
        S.set_target_language("tr")
        self.assertEqual(S.insert_sentence_breaks("Bu olay 2. Dünya Savaşı sırasında oldu. Sonra bitti."),
                         "Bu olay 2. Dünya Savaşı sırasında oldu.\nSonra bitti.")
        # Yıl (4 basamak) gerçek cümle sonu kalır.
        self.assertEqual(S.insert_sentence_breaks("Savaş 1945. Sonra barış geldi."),
                         "Savaş 1945.\nSonra barış geldi.")

    def test_english_target_keeps_digit_period_as_sentence_end(self):
        S.set_target_language("en")
        self.assertEqual(S.insert_sentence_breaks("I counted to 3. Then I left."),
                         "I counted to 3.\nThen I left.")

    def test_wrap_text_uses_written_language_for_ordinals(self):
        T.set_language_conventions("en")  # kaynak dil İngilizce
        try:
            self.assertEqual(T.wrap_text("Bu olay 2. Dünya Savaşı sırasında oldu. Çok sürdü.", 42, 2, "tr", "sentence"),
                             "Bu olay 2. Dünya Savaşı sırasında oldu.\nÇok sürdü.")
        finally:
            T.set_language_conventions("tr")

    def test_balanced_fallback_respects_abbreviations_and_max_lines(self):
        wrapped = T.wrap_text("Mr. Smith told me that the meeting would be moved to next Tuesday afternoon "
                              "because of the storm warning.", 42, 2, "en", "balanced")
        self.assertLessEqual(wrapped.count("\n"), 1, wrapped)
        self.assertFalse(wrapped.startswith("Mr.\n"), wrapped)


class OutputTransactionRecoveryTests(unittest.TestCase):
    def test_staging_journal_recovery_does_not_delete_later_user_file(self):
        root = Path(tempfile.mkdtemp())
        tx = P.OutputTransaction(root)
        tx.stage(root / "film.srt", lambda path: Path(path).write_text("staged", encoding="utf-8"))
        # İş burada çöktü (commit yok) → journal "staging". Kullanıcı aynı adla dosya oluşturur.
        P._OPEN_TRANSACTIONS.clear()
        (root / "film.srt").write_text("kullanıcı dosyası", encoding="utf-8")
        _quiet(P.recover_output_transactions, root)
        self.assertEqual((root / "film.srt").read_text(encoding="utf-8"), "kullanıcı dosyası")
        self.assertEqual(list(root.glob(".whisper-output-transaction-*.json")), [])

    def test_failed_job_rolls_back_open_transaction(self):
        root = Path(tempfile.mkdtemp())
        tx = P.OutputTransaction(root)
        tx.stage(root / "film.srt", lambda path: Path(path).write_text("staged", encoding="utf-8"))
        self.assertTrue(list(root.iterdir()))
        _quiet(P.rollback_open_output_transactions)
        self.assertEqual(sorted(p.name for p in root.iterdir()), [], "journal/.tmp kaldı")


if __name__ == "__main__":
    unittest.main(verbosity=2)
