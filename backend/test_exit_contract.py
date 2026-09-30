"""Backend çıkış-kodu / durum sözleşmesi kilidi (R329-2).

`transcribe.py` NDJSON protokolünde her başarısızlık stdout'a bir `error`
olayı yazar; çıkış kodu sözleşmesi:

  0   — işlev normal döndü
  1   — Exception yakalandı: journal/.tmp rollback + `error` olayı
  2   — argparse kullanım hatası (olay yok, usage stderr'de)
  130 — KeyboardInterrupt (Ctrl+C): rollback + `error`/`kind=cancelled` olayı

Sürücü betikleri `python -c` ile çalışır; ağır yolu devre dışı bırakmak için
`transcribe.transcribe` monkeypatch'lenir (faster_whisper açılmaz).
`python -c` tek-satır bağlamında `def` geçersizdir — hata fırlatma
`(_ for _ in ()).throw(...)` kalıbıyla yapılır.
"""

import json
import os
import subprocess
import sys
import unittest
from pathlib import Path

BACKEND = str(Path(__file__).resolve().parent)


def _run(driver_body, *argv):
    code = (
        "import sys; sys.path.insert(0, %r); import transcribe as T; "
        % BACKEND + driver_body + "\nT.main()"
    )
    env = dict(os.environ)
    # Windows'ta emit() konsol kod sayfasına (cp1252) düşer; hem çocuğun
    # yazımını hem ebeveynin okumasını UTF-8'e sabitle.
    env["PYTHONUTF8"] = "1"
    return subprocess.run(
        [sys.executable, "-c", code, *argv],
        capture_output=True, text=True, encoding="utf-8", timeout=60, env=env,
    )


def _events(stdout):
    out = []
    for line in stdout.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            out.append(json.loads(line))
        except json.JSONDecodeError:
            pass
    return out


_THROW = "lambda a: (_ for _ in ()).throw(%s)"


class TestExitContract(unittest.TestCase):
    def test_exception_exits_1_with_error_event(self):
        proc = _run(
            "T.transcribe = " + _THROW % "RuntimeError('sürücü hatası')",
            "--input", "nonexistent.mp4",
        )
        self.assertEqual(proc.returncode, 1, proc.stderr[-400:])
        events = _events(proc.stdout)
        self.assertEqual(events[-1]["type"], "error", proc.stdout[-400:])
        self.assertIn("sürücü hatası", events[-1]["message"])
        self.assertIn("traceback", events[-1])

    def test_clean_return_exits_0(self):
        proc = _run("T.transcribe = lambda a: None", "--input", "x.mp4")
        self.assertEqual(proc.returncode, 0, proc.stdout[-200:] + proc.stderr[-200:])

    def test_argparse_misuse_exits_2(self):
        proc = _run("T.transcribe = lambda a: None", "--bilinmeyen-bayrak")
        self.assertEqual(proc.returncode, 2)
        self.assertIn("usage", proc.stderr.lower())

    def test_keyboard_interrupt_exits_130_with_cancelled_error(self):
        proc = _run(
            "T.transcribe = " + _THROW % "KeyboardInterrupt()",
            "--input", "x.mp4",
        )
        self.assertEqual(proc.returncode, 130, proc.stderr[-400:])
        events = _events(proc.stdout)
        self.assertEqual(events[-1]["type"], "error")
        self.assertEqual(events[-1].get("kind"), "cancelled")

    def test_error_path_rolls_back_transactions(self):
        # rollback_open_output_transactions'in error olayından ÖNCE çağrıldığını
        # doğrula: sahte pipeline_control sayacı + emit'i saran prob.
        proc = _run(
            "import types\n"
            "pc = types.ModuleType('pipeline_control')\n"
            "calls = []\n"
            "pc.rollback_open_output_transactions = lambda: calls.append(1)\n"
            "sys.modules['pipeline_control'] = pc\n"
            "T.transcribe = " + (_THROW % "RuntimeError('x')") + "\n"
            "real_emit = T.emit\n"
            "T.emit = lambda t, **kw: real_emit(t, rolled=bool(calls), **kw)\n",
            "--input", "x.mp4",
        )
        self.assertEqual(proc.returncode, 1)
        events = _events(proc.stdout)
        self.assertTrue(events[-1].get("rolled"), "rollback çağrılmadan error olayı yazıldı")


if __name__ == '__main__':
    unittest.main()
