"""Kuyruk-50 madde 30: reexport çok-dosya çıktı işlemi transaction kilidi.

Önceki davranış: reexport her formatı doğrudan yazardı; yazım ortasında
çökme/iptal tutarsız çıktı kümesi bırakıyordu ve yarım işlem tanınmıyordu.
Kilitler: stage+commit tutarlılığı, mid-write hatada eski sağlam kümenin
korunması, açılışta yarım journal geri alımı.
"""
import argparse
import io
import json
import os
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import transcribe as T  # noqa: E402


def _args(src_json: Path, out_dir: Path, formats="srt,vtt,ass", lang_suffix=False):
    return argparse.Namespace(
        input=str(src_json),
        output_dir=str(out_dir),
        formats=formats,
        lang_suffix=lang_suffix,
        wrap_mode="sentence",
        max_line_width=42,
        max_lines=2,
        label_speakers=False,
        speaker_map="",
        youtube="",
    )


def _write_source_json(path: Path):
    path.write_text(json.dumps({
        "language": "tr",
        "segments": [
            {"start": 0.0, "end": 1.5, "text": "Merhaba dünya",
             "words": [{"start": 0.0, "end": 0.5, "word": "Merhaba"},
                       {"start": 0.6, "end": 1.5, "word": "dünya"}]},
            {"start": 1.6, "end": 3.0, "text": "İkinci satır"},
        ],
    }, ensure_ascii=False), encoding="utf-8")


def _residue(out_dir: Path):
    return [p.name for p in out_dir.glob(".whisper-output-transaction-*")]


def _ndjson(stdout_text: str):
    return [json.loads(line) for line in stdout_text.splitlines() if line.strip().startswith("{")]


class ReexportTransactionTests(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp())
        self.src = self.dir / "video.json"
        _write_source_json(self.src)
        self.out = self.dir / "out"
        self.out.mkdir()

    def _run(self, args, expect_error=None):
        buf = io.StringIO()
        with redirect_stdout(buf):
            if expect_error:
                with self.assertRaises(expect_error):
                    T.reexport_from_json(args)
            else:
                T.reexport_from_json(args)
        return _ndjson(buf.getvalue())

    def test_consistent_set_no_residue_and_done_event(self):
        events = self._run(_args(self.src, self.out))
        for fmt in ("srt", "vtt", "ass"):
            target = self.out / f"video.{fmt}"
            self.assertTrue(target.exists(), f"{fmt} eksik")
            self.assertIn("Merhaba", target.read_text(encoding="utf-8-sig"))
        self.assertEqual(_residue(self.out), [])
        done = [e for e in events if e.get("type") == "done"]
        self.assertEqual(len(done), 1)
        self.assertEqual(len(done[0]["files"]), 3)

    def test_mid_write_failure_preserves_old_consistent_set(self):
        (self.out / "video.srt").write_text("OLD SRT", encoding="utf-8")
        (self.out / "video.vtt").write_text("OLD VTT", encoding="utf-8")
        original = T.write_vtt
        T.write_vtt = lambda *a, **k: (_ for _ in ()).throw(OSError("disk full"))
        try:
            self._run(_args(self.src, self.out), expect_error=OSError)
        finally:
            T.write_vtt = original
        # Eski sağlam küme aynen korunur — staged dosya asla final olmadı.
        self.assertEqual((self.out / "video.srt").read_text(encoding="utf-8"), "OLD SRT")
        self.assertEqual((self.out / "video.vtt").read_text(encoding="utf-8"), "OLD VTT")
        self.assertFalse((self.out / "video.ass").exists())
        self.assertEqual(_residue(self.out), [])
        # İyileşme sonrası aynı iş temiz tutarlı küme üretir.
        self._run(_args(self.src, self.out))
        self.assertIn("Merhaba", (self.out / "video.srt").read_text(encoding="utf-8-sig"))
        self.assertIn("Merhaba", (self.out / "video.vtt").read_text(encoding="utf-8-sig"))
        self.assertEqual(_residue(self.out), [])

    def test_startup_recovery_rolls_back_prior_half_done_transaction(self):
        # Ölen bir işlemin 'prepared' journal'ı: video.srt vardı, backup'ta
        # orijinal içerik duruyor, staged yeni içerik yarım kaldı.
        final = self.out / "video.srt"
        staged = self.out / ".whisper-output-transaction-deadbeef-0.tmpsrt"
        backup = self.out / ".whisper-output-transaction-deadbeef-0.baksrt"
        journal = self.out / ".whisper-output-transaction-deadbeef00000000000000000000.json"
        final.write_text("PARTIAL NEW", encoding="utf-8")
        staged.write_text("STAGED", encoding="utf-8")
        backup.write_text("OLD GOOD SRT", encoding="utf-8")
        journal.write_text(json.dumps({
            "version": 1, "owner_pid": 424242424, "state": "prepared",
            "entries": [{"final": str(final), "staged": str(staged),
                         "backup": str(backup), "existed": True}],
        }), encoding="utf-8")
        events = self._run(_args(self.src, self.out, formats="srt"))
        # Journal tüketildi, eski yedek geri konulduktan sonra yeni tutarlı
        # küme yazıldı; artık dosya kalmadı.
        self.assertEqual(_residue(self.out), [])
        self.assertIn("Merhaba", final.read_text(encoding="utf-8-sig"))
        warns = [e for e in events if e.get("type") == "log" and e.get("level") == "warn"]
        self.assertTrue(any("geri alındı" in str(w.get("message", "")) for w in warns),
                        "yarım işlem geri alımı bildirilmeli")


if __name__ == "__main__":
    unittest.main(verbosity=2)
