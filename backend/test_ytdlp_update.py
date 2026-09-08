import hashlib
import io
import json
import os
import shutil
import tempfile
import threading
import unittest
import zipfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError

import update_ytdlp as U


def make_wheel(version="9999.1.0", traversal=False, include_package=True):
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as wheel:
        if include_package:
            wheel.writestr("yt_dlp/__init__.py", "from .version import __version__\n")
            wheel.writestr("yt_dlp/version.py", f"__version__ = {version!r}\n")
        wheel.writestr(
            f"yt_dlp-{version}.dist-info/WHEEL",
            "Wheel-Version: 1.0\nGenerator: WHARD-37\nRoot-Is-Purelib: true\nTag: py3-none-any\n",
        )
        if traversal:
            wheel.writestr("../outside.txt", "unsafe")
    return buffer.getvalue()


class FixtureHandler(BaseHTTPRequestHandler):
    routes = {}

    def do_GET(self):
        item = self.routes.get(self.path)
        if item is None:
            self.send_error(404)
            return
        status, body, headers, partial = item
        self.send_response(status)
        for key, value in headers.items():
            self.send_header(key, value)
        self.end_headers()
        if partial:
            self.wfile.write(body[: max(1, len(body) // 2)])
            self.wfile.flush()
            self.connection.shutdown(1)
        else:
            self.wfile.write(body)

    def log_message(self, *_args):
        pass


class UpdateServer:
    def __enter__(self):
        FixtureHandler.routes = {}
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), FixtureHandler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.base = f"http://127.0.0.1:{self.server.server_port}"
        return self

    def route(self, name, body=b"", status=200, content_length=None, partial=False, content_type=None):
        headers = {"Content-Length": str(len(body) if content_length is None else content_length)}
        if content_type:
            headers["Content-Type"] = content_type
        FixtureHandler.routes[f"/{name}"] = (status, body, headers, partial)
        return f"{self.base}/{name}"

    def metadata(self, version, wheel_url, digest):
        filename = f"yt_dlp-{version}-py3-none-any.whl"
        raw = json.dumps({
            "info": {"version": version},
            "urls": [{
                "packagetype": "bdist_wheel",
                "filename": filename,
                "url": wheel_url,
                "digests": {"sha256": digest},
            }],
        }).encode("utf-8")
        return self.route("metadata.json", raw, content_type="application/json")

    def __exit__(self, *_args):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)


class YtdlpUpdateTests(unittest.TestCase):
    def setUp(self):
        self.temp = Path(tempfile.mkdtemp(prefix="whisper-ytdlp-update-"))

    def tearDown(self):
        shutil.rmtree(self.temp, ignore_errors=True)

    def _activate(self, server, version="9999.1.0", wheel=None, digest=None, replace=os.replace):
        wheel = wheel if wheel is not None else make_wheel(version)
        wheel_url = server.route("artifact.whl", wheel)
        digest = digest or hashlib.sha256(wheel).hexdigest()
        metadata_url = server.metadata(version, wheel_url, digest)
        return U.update_runtime(
            self.temp,
            metadata_url=metadata_url,
            allow_http_localhost=True,
            replace=replace,
        )

    def test_fake_server_success_checksum_import_and_atomic_pointer(self):
        with UpdateServer() as server:
            result = self._activate(server)
        self.assertEqual(result["version"], "9999.1.0")
        active = json.loads((self.temp / "active.json").read_text(encoding="utf-8"))
        package = self.temp / active["path"]
        self.assertTrue((package / "yt_dlp" / "version.py").is_file())
        self.assertFalse(any((self.temp / "staging").iterdir()))

    def test_partial_download_never_changes_active_pointer(self):
        (self.temp / "active.json").write_text('{"path":"packages/old"}\n', encoding="utf-8")
        before = (self.temp / "active.json").read_bytes()
        wheel = make_wheel()
        with UpdateServer() as server:
            wheel_url = server.route("partial.whl", wheel, content_length=len(wheel) + 100, partial=True)
            metadata = server.metadata("9999.1.0", wheel_url, hashlib.sha256(wheel).hexdigest())
            with self.assertRaises(U.UpdateError):
                U.update_runtime(self.temp, metadata_url=metadata, allow_http_localhost=True)
        self.assertEqual((self.temp / "active.json").read_bytes(), before)
        self.assertFalse(any((self.temp / "staging").iterdir()))

    def test_checksum_mismatch_rejects_artifact(self):
        wheel = make_wheel()
        with UpdateServer() as server:
            with self.assertRaisesRegex(U.UpdateError, "SHA-256"):
                self._activate(server, wheel=wheel, digest="0" * 64)
        self.assertFalse((self.temp / "active.json").exists())

    def test_corrupt_wheel_and_zip_traversal_are_rejected(self):
        for wheel, expected in [(b"not-a-wheel", zipfile.BadZipFile), (make_wheel(traversal=True), U.UpdateError)]:
            with self.subTest(expected=expected.__name__), UpdateServer() as server:
                with self.assertRaises(expected):
                    self._activate(server, wheel=wheel)
            shutil.rmtree(self.temp, ignore_errors=True)
            self.temp.mkdir()

    def test_package_directory_replace_lock_keeps_old_pointer(self):
        (self.temp / "active.json").write_text('{"path":"packages/old"}\n', encoding="utf-8")
        before = (self.temp / "active.json").read_bytes()

        def locked_replace(_source, _target):
            raise PermissionError("antivirus lock")

        with UpdateServer() as server:
            with self.assertRaises(PermissionError):
                self._activate(server, replace=locked_replace)
        self.assertEqual((self.temp / "active.json").read_bytes(), before)

    def test_pointer_replace_lock_rolls_back_new_package(self):
        with UpdateServer() as server:
            old = self._activate(server, version="9999.1.0")
        before = (self.temp / "active.json").read_bytes()

        def pointer_locked_replace(source, target):
            if Path(target).name == "active.json":
                raise PermissionError("active pointer locked")
            return os.replace(source, target)

        with UpdateServer() as server:
            with self.assertRaises(PermissionError):
                self._activate(server, version="9999.2.0", replace=pointer_locked_replace)
        self.assertEqual((self.temp / "active.json").read_bytes(), before)
        new_dirs = [p.name for p in (self.temp / "packages").iterdir() if "9999.2.0" in p.name]
        self.assertEqual(new_dirs, [])
        self.assertTrue((self.temp / old["path"]).exists())

    def test_import_validation_failure_preserves_previous_version(self):
        with UpdateServer() as server:
            old = self._activate(server)
        before = (self.temp / "active.json").read_bytes()
        with UpdateServer() as server:
            with self.assertRaisesRegex(U.UpdateError, "yt_dlp modülü"):
                self._activate(server, version="9999.3.0", wheel=make_wheel("9999.3.0", include_package=False))
        self.assertEqual((self.temp / "active.json").read_bytes(), before)
        self.assertTrue((self.temp / old["path"]).exists())

    def test_http_403_and_429_have_turkish_classes(self):
        with UpdateServer() as server:
            for code, phrase in [(403, "erişimi reddetti"), (429, "çok fazla istek")]:
                with self.subTest(code=code):
                    url = server.route(f"error-{code}", b"", status=code)
                    try:
                        U.fetch_metadata(url)
                    except HTTPError as error:
                        self.assertIn(phrase, U.classify_update_error(error))
                    else:
                        self.fail("HTTP hata bekleniyordu")

    def test_metadata_rejects_non_https_non_local_artifact(self):
        metadata = {
            "info": {"version": "9999.1.0"},
            "urls": [{
                "packagetype": "bdist_wheel",
                "filename": "yt_dlp-9999.1.0-py3-none-any.whl",
                "url": "http://example.com/yt.whl",
                "digests": {"sha256": "a" * 64},
            }],
        }
        with self.assertRaisesRegex(U.UpdateError, "doğrulanabilir"):
            U.select_artifact(metadata)

    def test_runtime_rejects_non_https_metadata_before_network(self):
        called = False

        def opener(*_args, **_kwargs):
            nonlocal called
            called = True
            raise AssertionError("Ağ çağrısı yapılmamalıydı")

        with self.assertRaisesRegex(U.UpdateError, "metadata adresi"):
            U.update_runtime(
                self.temp,
                metadata_url="http://example.com/metadata.json",
                opener=opener,
            )
        self.assertFalse(called)

    def test_unknown_error_does_not_echo_sensitive_detail(self):
        message = U.classify_update_error(RuntimeError("SECRET-TOKEN / gizli/yol"))
        self.assertNotIn("SECRET", message)
        self.assertNotIn("gizli/yol", message)

    def test_stale_interrupted_transaction_is_cleaned_before_update(self):
        stale = self.temp / "staging" / "old-partial"
        stale.mkdir(parents=True)
        (stale / "partial.whl").write_bytes(b"partial")
        with UpdateServer() as server:
            self._activate(server)
        self.assertFalse(stale.exists())

    def test_cross_process_lock_rejects_parallel_update_and_recovers_dead_owner(self):
        with U.update_lock(self.temp):
            with self.assertRaisesRegex(U.UpdateError, "zaten çalışıyor"):
                with U.update_lock(self.temp):
                    pass
        (self.temp / "update.lock").write_text(
            json.dumps({"pid": 999_999_999, "token": "dead"}), encoding="utf-8"
        )
        with U.update_lock(self.temp):
            self.assertTrue((self.temp / "update.lock").exists())
        self.assertFalse((self.temp / "update.lock").exists())

    def test_package_versions_are_bounded_after_success(self):
        packages = self.temp / "packages"
        packages.mkdir(parents=True)
        for index in range(6):
            item = packages / f"old-{index}"
            item.mkdir()
            os.utime(item, (index + 1, index + 1))
        U.prune_packages(self.temp, ["packages/old-0"], maximum=3)
        remaining = {item.name for item in packages.iterdir()}
        self.assertLessEqual(len(remaining), 3)
        self.assertIn("old-0", remaining)

    def test_post_commit_cleanup_lock_does_not_remove_active_version(self):
        original = U.prune_packages
        U.prune_packages = lambda *_args, **_kwargs: (_ for _ in ()).throw(PermissionError("locked"))
        try:
            with UpdateServer() as server:
                result = self._activate(server)
        finally:
            U.prune_packages = original
        self.assertTrue((self.temp / result["path"]).exists())
        self.assertEqual(json.loads((self.temp / "active.json").read_text())["path"], result["path"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
