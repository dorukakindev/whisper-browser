"""yt-dlp çekirdeğini kullanıcı profilinde atomik, geri alınabilir biçimde günceller."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import uuid
import zipfile
from contextlib import contextmanager
from pathlib import Path, PurePosixPath
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen


DEFAULT_METADATA_URL = "https://pypi.org/pypi/yt-dlp/json"
MAX_METADATA_BYTES = 2 * 1024 * 1024
MAX_WHEEL_BYTES = 80 * 1024 * 1024
MAX_EXTRACTED_BYTES = 160 * 1024 * 1024
MAX_WHEEL_FILES = 20_000
MAX_PACKAGE_VERSIONS = 3


class UpdateError(RuntimeError):
    pass


def classify_update_error(error):
    if isinstance(error, HTTPError):
        if error.code == 403:
            return "yt-dlp güncelleme sunucusu erişimi reddetti (HTTP 403)."
        if error.code == 429:
            return "yt-dlp güncelleme sunucusu çok fazla istek nedeniyle bekleme istedi (HTTP 429)."
        return f"yt-dlp güncelleme sunucusu HTTP {error.code} hatası döndürdü."
    if isinstance(error, URLError):
        return "yt-dlp güncelleme sunucusuna bağlanılamadı. Ağ ve DNS bağlantısını doğrulayın."
    if isinstance(error, PermissionError):
        return "yt-dlp güncelleme dosyası antivirüs veya başka bir süreç tarafından kilitlendi."
    if isinstance(error, zipfile.BadZipFile):
        return "İndirilen yt-dlp paketi bozuk veya geçerli bir wheel değil."
    if isinstance(error, UpdateError):
        return str(error)
    return "yt-dlp güncellemesi beklenmeyen bir nedenle tamamlanamadı."


def _read_limited(response, limit):
    data = bytearray()
    while True:
        block = response.read(min(64 * 1024, limit + 1 - len(data)))
        if not block:
            break
        data.extend(block)
        if len(data) > limit:
            raise UpdateError("Güncelleme yanıtı güvenli boyut sınırını aştı.")
    expected = response.headers.get("Content-Length")
    if expected:
        try:
            if int(expected) != len(data):
                raise UpdateError("Güncelleme indirmesi yarıda kesildi; eksik dosya kullanılmadı.")
        except ValueError:
            raise UpdateError("Güncelleme sunucusu geçersiz Content-Length gönderdi.")
    return bytes(data)


def fetch_metadata(url=DEFAULT_METADATA_URL, opener=urlopen, timeout=30):
    request = Request(url, headers={"Accept": "application/json", "User-Agent": "Whisper-Local-Updater/1"})
    with opener(request, timeout=timeout) as response:
        raw = _read_limited(response, MAX_METADATA_BYTES)
    try:
        metadata = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise UpdateError("Güncelleme sunucusu geçerli JSON metadata döndürmedi.") from error
    if not isinstance(metadata, dict):
        raise UpdateError("Güncelleme metadata biçimi geçersiz.")
    return metadata


def _url_is_allowed(url, allow_http_localhost=False):
    parsed = urlparse(str(url))
    if parsed.scheme == "https" and parsed.hostname:
        return True
    return bool(
        allow_http_localhost
        and parsed.scheme == "http"
        and parsed.hostname in {"127.0.0.1", "localhost", "::1"}
    )


def select_artifact(metadata, allow_http_localhost=False):
    info = metadata.get("info") or {}
    version = str(info.get("version") or "").strip()
    if not re.fullmatch(r"[A-Za-z0-9._+-]{1,80}", version):
        raise UpdateError("yt-dlp metadata sürümü geçersiz.")
    candidates = []
    for item in metadata.get("urls") or []:
        filename = str(item.get("filename") or "")
        url = str(item.get("url") or "")
        digest = str((item.get("digests") or {}).get("sha256") or "").lower()
        if item.get("packagetype") != "bdist_wheel":
            continue
        if not re.fullmatch(r"yt_dlp-[^-]+-py3-none-any\.whl", filename, re.I):
            continue
        if not re.fullmatch(r"[0-9a-f]{64}", digest):
            continue
        if not _url_is_allowed(url, allow_http_localhost):
            continue
        candidates.append({"version": version, "filename": filename, "url": url, "sha256": digest})
    if not candidates:
        raise UpdateError("Metadata içinde doğrulanabilir yt-dlp wheel paketi bulunamadı.")
    return candidates[0]


def download_artifact(artifact, destination, opener=urlopen, timeout=45):
    request = Request(artifact["url"], headers={"User-Agent": "Whisper-Local-Updater/1"})
    destination = Path(destination)
    digest = hashlib.sha256()
    total = 0
    try:
        with opener(request, timeout=timeout) as response, open(destination, "xb") as output:
            declared = response.headers.get("Content-Length")
            if declared:
                try:
                    if int(declared) > MAX_WHEEL_BYTES:
                        raise UpdateError("yt-dlp paketi güvenli boyut sınırını aştı.")
                except ValueError:
                    raise UpdateError("Güncelleme sunucusu geçersiz Content-Length gönderdi.")
            while True:
                block = response.read(64 * 1024)
                if not block:
                    break
                total += len(block)
                if total > MAX_WHEEL_BYTES:
                    raise UpdateError("yt-dlp paketi güvenli boyut sınırını aştı.")
                digest.update(block)
                output.write(block)
            output.flush()
            os.fsync(output.fileno())
            if declared and int(declared) != total:
                raise UpdateError("Güncelleme indirmesi yarıda kesildi; eksik dosya kullanılmadı.")
        if digest.hexdigest().lower() != artifact["sha256"]:
            raise UpdateError("İndirilen yt-dlp paketinin SHA-256 özeti metadata ile eşleşmiyor.")
        return destination
    except Exception:
        try:
            destination.unlink()
        except FileNotFoundError:
            pass
        raise


def extract_wheel(wheel_path, destination):
    destination = Path(destination)
    destination.mkdir(parents=True, exist_ok=False)
    total = 0
    with zipfile.ZipFile(wheel_path) as archive:
        members = archive.infolist()
        if len(members) > MAX_WHEEL_FILES:
            raise UpdateError("yt-dlp wheel dosya sayısı güvenli sınırı aştı.")
        for member in members:
            name = PurePosixPath(member.filename)
            if (
                name.is_absolute()
                or ".." in name.parts
                or "\0" in member.filename
                or "\\" in member.filename
                or any(":" in part for part in name.parts)
            ):
                raise UpdateError("yt-dlp wheel güvenli olmayan bir dosya yolu içeriyor.")
            mode = (member.external_attr >> 16) & 0o170000
            if mode == 0o120000:
                raise UpdateError("yt-dlp wheel sembolik bağlantı içeriyor.")
            total += member.file_size
            if total > MAX_EXTRACTED_BYTES:
                raise UpdateError("yt-dlp wheel açılmış boyutu güvenli sınırı aştı.")
        archive.extractall(destination)
    return destination


def validate_runtime(package_dir, expected_version, python_path=sys.executable, run=subprocess.run):
    package_dir = Path(package_dir)
    if not (package_dir / "yt_dlp" / "__init__.py").is_file():
        raise UpdateError("Güncelleme paketinde yt_dlp modülü bulunamadı.")
    code = (
        "import sys; sys.path.insert(0, sys.argv[1]); "
        "from yt_dlp.version import __version__; print(__version__)"
    )
    result = run(
        [str(python_path), "-I", "-c", code, str(package_dir)],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=20,
    )
    actual = (result.stdout or "").strip().splitlines()
    actual = actual[-1] if actual else ""
    if result.returncode != 0 or actual != expected_version:
        raise UpdateError("Yeni yt-dlp paketi bağımsız import doğrulamasını geçemedi.")
    return actual


def read_active(runtime_root):
    active_path = Path(runtime_root) / "active.json"
    try:
        data = json.loads(active_path.read_text(encoding="utf-8"))
    except (FileNotFoundError, OSError, json.JSONDecodeError):
        return None
    return data if isinstance(data, dict) else None


def _atomic_write_json(path, payload, replace=os.replace):
    path = Path(path)
    temp_path = path.with_name(f".{path.name}.{uuid.uuid4().hex}.tmp")
    try:
        with open(temp_path, "x", encoding="utf-8", newline="\n") as output:
            json.dump(payload, output, ensure_ascii=False, sort_keys=True)
            output.write("\n")
            output.flush()
            os.fsync(output.fileno())
        replace(temp_path, path)
    except Exception:
        try:
            temp_path.unlink()
        except FileNotFoundError:
            pass
        raise


def cleanup_stale_staging(runtime_root):
    staging_root = Path(runtime_root) / "staging"
    if not staging_root.exists():
        return
    for child in staging_root.iterdir():
        if child.is_dir():
            shutil.rmtree(child, ignore_errors=True)
        else:
            try:
                child.unlink()
            except OSError:
                pass


def _process_alive(pid):
    try:
        pid = int(pid)
    except (TypeError, ValueError):
        return False
    if pid <= 0:
        return False
    if os.name == "nt":
        # Windows'ta os.kill(pid, 0) POSIX'teki zararsız varlık sorgusu
        # değildir; hedefe CTRL_C_EVENT gönderip güncelleyiciyi kesebilir.
        import ctypes

        process_query_limited_information = 0x1000
        error_access_denied = 5
        still_active = 259
        kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
        handle = kernel32.OpenProcess(process_query_limited_information, False, pid)
        if not handle:
            return ctypes.get_last_error() == error_access_denied
        try:
            exit_code = ctypes.c_ulong()
            if not kernel32.GetExitCodeProcess(handle, ctypes.byref(exit_code)):
                return True
            return exit_code.value == still_active
        finally:
            kernel32.CloseHandle(handle)
    try:
        os.kill(pid, 0)
        return True
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    except (OSError, TypeError, ValueError):
        return False


@contextmanager
def update_lock(runtime_root):
    root = Path(runtime_root)
    root.mkdir(parents=True, exist_ok=True)
    lock_path = root / "update.lock"
    token = uuid.uuid4().hex
    for _attempt in range(2):
        try:
            descriptor = os.open(lock_path, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
        except FileExistsError:
            try:
                owner = json.loads(lock_path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                owner = {}
            if _process_alive(owner.get("pid")):
                raise UpdateError("Başka bir yt-dlp güncellemesi zaten çalışıyor.")
            try:
                lock_path.unlink()
            except FileNotFoundError:
                pass
            except PermissionError as error:
                raise UpdateError("Eski yt-dlp güncelleme kilidi kaldırılamadı.") from error
            continue
        else:
            with os.fdopen(descriptor, "w", encoding="utf-8") as output:
                json.dump({"pid": os.getpid(), "token": token}, output)
                output.flush()
                os.fsync(output.fileno())
            break
    else:
        raise UpdateError("yt-dlp güncelleme kilidi alınamadı.")
    try:
        yield
    finally:
        try:
            owner = json.loads(lock_path.read_text(encoding="utf-8"))
            if owner.get("token") == token:
                lock_path.unlink()
        except (FileNotFoundError, OSError, json.JSONDecodeError):
            pass


def prune_packages(runtime_root, keep_relative, maximum=MAX_PACKAGE_VERSIONS):
    packages = Path(runtime_root) / "packages"
    keep = {str(item).replace("\\", "/") for item in keep_relative if item}
    directories = sorted(
        (item for item in packages.iterdir() if item.is_dir()),
        key=lambda item: item.stat().st_mtime_ns,
        reverse=True,
    )
    retained = set(keep)
    for directory in directories:
        relative = str(directory.relative_to(runtime_root)).replace("\\", "/")
        if relative in retained:
            continue
        if len(retained) < maximum:
            retained.add(relative)
            continue
        shutil.rmtree(directory, ignore_errors=True)


def _update_runtime_unlocked(
    runtime_root,
    metadata_url=DEFAULT_METADATA_URL,
    opener=urlopen,
    python_path=sys.executable,
    replace=os.replace,
    validator=validate_runtime,
    allow_http_localhost=False,
):
    runtime_root = Path(runtime_root).resolve()
    runtime_root.mkdir(parents=True, exist_ok=True)
    (runtime_root / "packages").mkdir(exist_ok=True)
    (runtime_root / "staging").mkdir(exist_ok=True)
    cleanup_stale_staging(runtime_root)
    transaction = Path(tempfile.mkdtemp(prefix="update-", dir=runtime_root / "staging"))
    created_final = False
    committed = False
    final_dir = None
    try:
        if not _url_is_allowed(metadata_url, allow_http_localhost=allow_http_localhost):
            raise UpdateError("Güncelleme metadata adresi güvenli HTTPS kullanmıyor.")
        metadata = fetch_metadata(metadata_url, opener=opener)
        artifact = select_artifact(metadata, allow_http_localhost=allow_http_localhost)
        wheel_path = transaction / artifact["filename"]
        download_artifact(artifact, wheel_path, opener=opener)
        extracted = extract_wheel(wheel_path, transaction / "package")
        validator(extracted, artifact["version"], python_path=python_path)

        final_name = f"yt-dlp-{artifact['version']}-{artifact['sha256'][:12]}"
        final_dir = runtime_root / "packages" / final_name
        if not final_dir.exists():
            replace(extracted, final_dir)
            created_final = True
        validator(final_dir, artifact["version"], python_path=python_path)

        previous = read_active(runtime_root)
        payload = {
            "path": str(final_dir.relative_to(runtime_root)).replace("\\", "/"),
            "version": artifact["version"],
            "sha256": artifact["sha256"],
        }
        if previous and isinstance(previous.get("path"), str):
            payload["previous"] = previous["path"]
        _atomic_write_json(runtime_root / "active.json", payload, replace=replace)
        committed = True
        try:
            prune_packages(runtime_root, [payload.get("path"), payload.get("previous")])
        except OSError:
            # Temizlik housekeeping'dir; aktif pointer başarıyla değiştikten sonra
            # antivirüs kilidi yüzünden çalışan yeni sürümü geri alma.
            pass
        return payload
    except Exception:
        if created_final and not committed and final_dir is not None:
            shutil.rmtree(final_dir, ignore_errors=True)
        raise
    finally:
        shutil.rmtree(transaction, ignore_errors=True)


def update_runtime(
    runtime_root,
    metadata_url=DEFAULT_METADATA_URL,
    opener=urlopen,
    python_path=sys.executable,
    replace=os.replace,
    validator=validate_runtime,
    allow_http_localhost=False,
):
    with update_lock(runtime_root):
        return _update_runtime_unlocked(
            runtime_root,
            metadata_url=metadata_url,
            opener=opener,
            python_path=python_path,
            replace=replace,
            validator=validator,
            allow_http_localhost=allow_http_localhost,
        )


def main(argv=None):
    parser = argparse.ArgumentParser(description="Atomik yt-dlp güncelleyicisi")
    parser.add_argument("--runtime-root", required=True)
    parser.add_argument("--metadata-url", default=DEFAULT_METADATA_URL)
    args = parser.parse_args(argv)
    try:
        result = update_runtime(args.runtime_root, metadata_url=args.metadata_url)
        print(json.dumps({"ok": True, **result}, ensure_ascii=False), flush=True)
        return 0
    except Exception as error:
        print(json.dumps({"ok": False, "error": classify_update_error(error)}, ensure_ascii=False), flush=True)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
