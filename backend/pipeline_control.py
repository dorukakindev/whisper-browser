"""Pipeline cancellation checkpoints and crash-recoverable output transactions."""

from __future__ import annotations

import json
import os
import shutil
import tempfile
import uuid
from pathlib import Path


PIPELINE_STAGES = (
    "download", "extract", "load_model", "transcribe", "llm", "diarize", "write",
)
PIPELINE_TIMING_POINTS = ("before", "start", "during", "after", "handoff")


class PipelineCancelled(BaseException):
    """Exception catches must not accidentally turn cancellation into a warning."""

    def __init__(self, stage: str, point: str):
        super().__init__(f"Pipeline cancelled at {stage}:{point}")
        self.stage = stage
        self.point = point


class CancellationController:
    def __init__(self, marker_path: str | None = None, probe=None):
        self.marker_path = str(marker_path or "")
        self.probe = probe

    def checkpoint(self, stage: str, point: str = "during") -> None:
        if stage not in PIPELINE_STAGES:
            raise ValueError(f"Unknown pipeline stage: {stage}")
        if point not in PIPELINE_TIMING_POINTS:
            raise ValueError(f"Unknown cancellation point: {point}")
        if self.probe is not None:
            self.probe(stage, point)
        if self.marker_path and os.path.isfile(self.marker_path):
            raise PipelineCancelled(stage, point)


_CANCELLATION = CancellationController(os.environ.get("WHISPER_CANCEL_FILE"))


def cancellation_checkpoint(stage: str, point: str = "during") -> None:
    _CANCELLATION.checkpoint(stage, point)


def job_temp_directory(prefix: str) -> str:
    """Keep backend scratch data under the main-process-owned job directory."""
    parent = os.environ.get("WHISPER_JOB_TEMP_DIR", "").strip()
    if parent:
        Path(parent).mkdir(parents=True, exist_ok=True)
        return tempfile.mkdtemp(prefix=prefix, dir=parent)
    return tempfile.mkdtemp(prefix=prefix)


def _write_json_atomic(path: Path, payload: dict) -> None:
    tmp = path.with_name(path.name + ".tmp")
    with open(tmp, "w", encoding="utf-8", newline="\n") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)
        handle.flush()
        os.fsync(handle.fileno())
    os.replace(tmp, path)


def _entry_paths_are_local(entry: dict, output_dir: Path) -> bool:
    try:
        root = output_dir.resolve()
        return all(Path(entry[name]).resolve().parent == root
                   for name in ("final", "staged", "backup"))
    except (KeyError, OSError, RuntimeError, TypeError, ValueError):
        return False


def _cleanup_entry_files(entry: dict, keep_final: bool = True) -> None:
    for name in ("staged", "backup"):
        try:
            Path(entry[name]).unlink(missing_ok=True)
        except OSError:
            pass
    if not keep_final:
        try:
            Path(entry["final"]).unlink(missing_ok=True)
        except OSError:
            pass


def _pid_is_alive(pid) -> bool:
    try:
        pid = int(pid)
        if pid <= 0:
            return False
        if pid == os.getpid():
            return True
        if os.name == "nt":
            # Windows'ta os.kill(pid, 0) yeni sonlanan PID'leri canlı
            # gösterebilir ve bazı CPython/Windows birleşimlerinde SystemError
            # üretebilir. Gerçek çıkış durumunu salt-okunur işlem tutamacından
            # sorgula.
            import ctypes
            from ctypes import wintypes

            process_query_limited_information = 0x1000
            still_active = 259
            error_access_denied = 5
            kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
            open_process = kernel32.OpenProcess
            open_process.argtypes = (wintypes.DWORD, wintypes.BOOL, wintypes.DWORD)
            open_process.restype = wintypes.HANDLE
            get_exit_code = kernel32.GetExitCodeProcess
            get_exit_code.argtypes = (wintypes.HANDLE, ctypes.POINTER(wintypes.DWORD))
            get_exit_code.restype = wintypes.BOOL
            close_handle = kernel32.CloseHandle
            close_handle.argtypes = (wintypes.HANDLE,)
            close_handle.restype = wintypes.BOOL

            handle = open_process(process_query_limited_information, False, pid)
            if not handle:
                # Erişim reddi: süreç var olabilir fakat sorgu yetkisi yoktur;
                # journal'ı yanlışlıkla geri almamak için canlı kabul edilir.
                return ctypes.get_last_error() == error_access_denied
            try:
                exit_code = wintypes.DWORD()
                if not get_exit_code(handle, ctypes.byref(exit_code)):
                    return True
                return exit_code.value == still_active
            finally:
                close_handle(handle)
        os.kill(pid, 0)
        return True
    except PermissionError:
        return True
    except Exception:
        # Süreç sondası hiçbir zaman başlangıç kurtarmasını düşürmemeli.
        return False


def recover_output_transactions(output_dir) -> int:
    """Rollback interrupted commits, or only clean debris from committed ones."""
    root = Path(output_dir)
    if not root.is_dir():
        return 0
    recovered = 0
    for journal in root.glob(".whisper-output-transaction-*.json"):
        try:
            data = json.loads(journal.read_text(encoding="utf-8"))
            owner_pid = data.get("owner_pid")
            if owner_pid and int(owner_pid) != os.getpid() and _pid_is_alive(owner_pid):
                continue
            entries = data.get("entries")
            if not isinstance(entries, list) or not all(
                    isinstance(row, dict) and _entry_paths_are_local(row, root)
                    for row in entries):
                continue
            committed = data.get("state") == "committed"
            if committed:
                for row in entries:
                    _cleanup_entry_files(row, keep_final=True)
            else:
                for row in reversed(entries):
                    final = Path(row["final"])
                    backup = Path(row["backup"])
                    if row.get("existed") and backup.exists():
                        os.replace(backup, final)
                    elif not row.get("existed"):
                        try:
                            final.unlink(missing_ok=True)
                        except OSError:
                            pass
                    _cleanup_entry_files(row, keep_final=True)
            journal.unlink(missing_ok=True)
            journal.with_name(journal.name + ".tmp").unlink(missing_ok=True)
            recovered += 1
        except (OSError, ValueError, json.JSONDecodeError):
            # Tanınmayan/bozuk bir dosyayı otomatik silmek güvenli değildir.
            continue
    return recovered


class OutputTransaction:
    """Stage all outputs and atomically replace finals with rollback journaling."""

    def __init__(self, output_dir, checkpoint=cancellation_checkpoint, replace=os.replace,
                 warning=None):
        self.output_dir = Path(output_dir).resolve()
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.token = uuid.uuid4().hex
        self.journal = self.output_dir / f".whisper-output-transaction-{self.token}.json"
        self.entries: list[dict] = []
        self.state = "staging"
        self.closed = False
        self.checkpoint = checkpoint
        self._replace = replace
        self._warning = warning
        self._persist()

    def _warn_rollback_deferred(self) -> None:
        if not callable(self._warning):
            return
        try:
            self._warning(
                "Çıktı dosyası başka bir program tarafından kullanılıyor veya dosya sistemi "
                "erişimi engelliyor. İşlem günlüğü korundu; geri alma sonraki başlatmada "
                "yeniden denenecek."
            )
        except Exception:
            # Bir kullanıcı bildirimi hiçbir zaman asıl yazma/kurtarma hatasını maskeleyemez.
            pass

    def _persist(self) -> None:
        _write_json_atomic(self.journal, {
            "version": 1,
            "owner_pid": os.getpid(),
            "state": self.state,
            "entries": self.entries,
        })

    def stage(self, final_path, writer):
        if self.closed:
            raise RuntimeError("Output transaction is already closed")
        final = Path(final_path).resolve()
        if final.parent != self.output_dir:
            raise RuntimeError("Output transaction target escaped its output directory")
        index = len(self.entries)
        suffix = final.suffix or ".tmp"
        staged = self.output_dir / f".whisper-output-transaction-{self.token}-{index}.tmp{suffix}"
        backup = self.output_dir / f".whisper-output-transaction-{self.token}-{index}.bak{suffix}"
        entry = {
            "final": str(final), "staged": str(staged), "backup": str(backup),
            "existed": final.exists(),
        }
        self.entries.append(entry)
        self._persist()
        try:
            self.checkpoint("write", "during")
            result = writer(staged)
            self.checkpoint("write", "during")
            if not staged.exists():
                self.entries.pop()
                self._persist()
            return result
        except BaseException:
            # Opsiyonel bir çıktı (dual/rapor) hata verdiğinde çağıran bu hatayı
            # uyarıya çevirebilir. Yalnız başarısız stage'i düşür; transaction'ın
            # tamamını kapatmak daha önce hazırlanmış sağlam çıktıları yok ederdi.
            _cleanup_entry_files(entry, keep_final=True)
            if self.entries and self.entries[-1] is entry:
                self.entries.pop()
            else:
                self.entries = [row for row in self.entries if row is not entry]
            self._persist()
            raise

    def commit(self) -> None:
        if self.closed:
            return
        try:
            self.state = "prepared"
            self._persist()
            for entry in self.entries:
                final = Path(entry["final"])
                backup = Path(entry["backup"])
                if entry["existed"]:
                    shutil.copy2(final, backup)
            for entry in self.entries:
                self.checkpoint("write", "during")
                self._replace(entry["staged"], entry["final"])
            self.checkpoint("write", "after")
            # Son iptal sınırı committed journal'dan ÖNCE gelir. Bu noktaya kadar
            # crash/cancel olursa hem Python hem supervisor eski çıktıyı geri alır.
            self.checkpoint("write", "handoff")
            self.state = "committed"
            self._persist()
            for entry in self.entries:
                _cleanup_entry_files(entry, keep_final=True)
            self.journal.unlink(missing_ok=True)
            self.closed = True
        except BaseException:
            self.rollback()
            raise

    def rollback(self) -> bool:
        if self.closed:
            return True
        deferred = False
        for entry in reversed(self.entries):
            final = Path(entry["final"])
            backup = Path(entry["backup"])
            try:
                if entry.get("existed") and backup.exists():
                    self._replace(backup, final)
                elif not entry.get("existed") and self.state != "staging":
                    final.unlink(missing_ok=True)
            except OSError:
                # Kilitli hedefte backup/journal silinmemeli. Asıl commit hatası
                # çağırana döner; sonraki başlangıç aynı günlüğü tekrar kurtarır.
                deferred = True
                continue
            _cleanup_entry_files(entry, keep_final=True)
        if deferred:
            self._warn_rollback_deferred()
            return False
        try:
            self.journal.unlink(missing_ok=True)
            self.journal.with_name(self.journal.name + ".tmp").unlink(missing_ok=True)
        except OSError:
            self._warn_rollback_deferred()
            return False
        self.closed = True
        return True
