import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from pipeline_control import (
    OutputTransaction,
    PipelineCancelled,
    _pid_is_alive,
    recover_output_transactions,
)


class OutputTransactionWarningTests(unittest.TestCase):
    def test_dead_pid_is_never_treated_as_live_or_raised(self):
        process = subprocess.Popen([
            sys.executable, "-c", "import time; time.sleep(30)",
        ])
        try:
            self.assertTrue(_pid_is_alive(process.pid))
        finally:
            process.terminate()
            process.wait(timeout=10)
        for _attempt in range(20):
            self.assertFalse(_pid_is_alive(process.pid))

    def test_dead_owner_journal_is_recovered_without_probe_crash(self):
        for attempt in range(5):
            process = subprocess.Popen([sys.executable, "-c", "pass"])
            process.wait(timeout=10)
            with tempfile.TemporaryDirectory() as work:
                root = Path(work)
                final = root / "altyazi.srt"
                staged = root / ".tx.tmp.srt"
                backup = root / ".tx.bak.srt"
                journal = root / f".whisper-output-transaction-{attempt:032x}.json"
                final.write_text("YENI", encoding="utf-8")
                staged.write_text("ARTIK", encoding="utf-8")
                backup.write_text("ESKI", encoding="utf-8")
                journal.write_text(json.dumps({
                    "version": 1, "owner_pid": process.pid, "state": "prepared",
                    "entries": [{"final": str(final), "staged": str(staged),
                                 "backup": str(backup), "existed": True}],
                }), encoding="utf-8")
                self.assertEqual(recover_output_transactions(root), 1)
                self.assertEqual(final.read_text(encoding="utf-8"), "ESKI")
                self.assertEqual(list(root.iterdir()), [final])

    def test_live_jobs_are_skipped_and_external_paths_are_never_touched(self):
        processes = [subprocess.Popen(
            [sys.executable, "-c", "import time; time.sleep(30)"]) for _ in range(2)]
        try:
            with tempfile.TemporaryDirectory() as work, tempfile.TemporaryDirectory() as outside:
                root, external = Path(work), Path(outside) / "koru.srt"
                external.write_text("KORU", encoding="utf-8")
                for index, process in enumerate(processes):
                    final = root / f"canli-{index}.srt"
                    staged = root / f".canli-{index}.tmp.srt"
                    backup = root / f".canli-{index}.bak.srt"
                    for path, text in ((final, "YENI"), (staged, "ARTIK"), (backup, "ESKI")):
                        path.write_text(text, encoding="utf-8")
                    (root / f".whisper-output-transaction-{index + 10:032x}.json").write_text(
                        json.dumps({"version": 1, "owner_pid": process.pid, "state": "prepared",
                                    "entries": [{"final": str(final), "staged": str(staged),
                                                 "backup": str(backup), "existed": True}]}),
                        encoding="utf-8")
                malicious = root / f".whisper-output-transaction-{99:032x}.json"
                malicious.write_text(json.dumps({
                    "version": 1, "owner_pid": 99999999, "state": "prepared",
                    "entries": [{"final": str(external), "staged": str(external),
                                 "backup": str(external), "existed": True}],
                }), encoding="utf-8")
                self.assertEqual(recover_output_transactions(root), 0)
                self.assertEqual(external.read_text(encoding="utf-8"), "KORU")
                processes[0].terminate()
                processes[0].wait(timeout=10)
                self.assertEqual(recover_output_transactions(root), 1)
                self.assertTrue((root / f".whisper-output-transaction-{11:032x}.json").exists())
                self.assertTrue(malicious.exists())
                self.assertEqual(external.read_text(encoding="utf-8"), "KORU")
        finally:
            for process in processes:
                if process.poll() is None:
                    process.terminate()
                    process.wait(timeout=10)

    def test_locked_rollback_warns_and_preserves_journal_for_startup_recovery(self):
        with tempfile.TemporaryDirectory() as work:
            root = Path(work)
            target = root / "altyazi.srt"
            target.write_text("ESKI", encoding="utf-8")
            warnings = []
            calls = 0

            def locked_replace(source, destination):
                nonlocal calls
                calls += 1
                if calls <= 2:
                    raise PermissionError("dosya kilitli")
                os.replace(source, destination)

            tx = OutputTransaction(root, replace=locked_replace, warning=warnings.append)
            tx.stage(target, lambda staged: Path(staged).write_text("YENI", encoding="utf-8"))

            with self.assertRaises(PermissionError):
                tx.commit()

            self.assertEqual(target.read_text(encoding="utf-8"), "ESKI")
            self.assertFalse(tx.closed)
            self.assertTrue(tx.journal.exists())
            self.assertTrue(Path(tx.entries[0]["backup"]).exists())
            self.assertEqual(len(warnings), 1)
            self.assertIn("başka bir program", warnings[0])
            self.assertIn("sonraki başlatmada", warnings[0])

            # Kilit kalkınca başlangıç kurtarması aynı journal üzerinden tamamlanır.
            self.assertEqual(recover_output_transactions(root), 1)
            self.assertEqual(target.read_text(encoding="utf-8"), "ESKI")
            self.assertFalse(tx.journal.exists())

    def test_warning_callback_failure_does_not_mask_original_commit_error(self):
        with tempfile.TemporaryDirectory() as work:
            root = Path(work)
            target = root / "altyazi.srt"
            target.write_text("ESKI", encoding="utf-8")
            calls = 0

            def locked_replace(source, destination):
                nonlocal calls
                calls += 1
                raise PermissionError(f"kilit-{calls}")

            def broken_warning(_message):
                raise RuntimeError("UI kapalı")

            tx = OutputTransaction(root, replace=locked_replace, warning=broken_warning)
            tx.stage(target, lambda staged: Path(staged).write_text("YENI", encoding="utf-8"))
            with self.assertRaisesRegex(PermissionError, "kilit-1"):
                tx.commit()
            self.assertTrue(tx.journal.exists())

    def test_cancel_before_first_commit_replace_preserves_old_output(self):
        with tempfile.TemporaryDirectory() as work:
            root = Path(work)
            target = root / "altyazi.srt"
            target.write_text("ESKI", encoding="utf-8")
            checkpoints = []

            def cancel_on_commit(stage, point):
                checkpoints.append((stage, point))
                # stage() iki sınır çağırır; üçüncü çağrı commit'in ilk
                # os.replace işleminden hemen öncedir.
                if len(checkpoints) == 3:
                    raise PipelineCancelled(stage, point)

            tx = OutputTransaction(root, checkpoint=cancel_on_commit)
            tx.stage(target, lambda staged: Path(staged).write_text("YENI", encoding="utf-8"))
            with self.assertRaises(PipelineCancelled):
                tx.commit()

            self.assertEqual(target.read_text(encoding="utf-8"), "ESKI")
            self.assertTrue(tx.closed)
            self.assertFalse(tx.journal.exists())
            self.assertEqual(list(root.iterdir()), [target])


if __name__ == "__main__":
    unittest.main()
