import tempfile
import unittest
from pathlib import Path

import media


class MediaValidationTests(unittest.TestCase):
    def test_clip_requires_output_file(self):
        # '--output-file' boşsa Path('').with_suffix() anlaşılmaz bir
        # ValueError üretiyordu; artık eksik parametre açıkça söylenir.
        with tempfile.TemporaryDirectory() as work:
            with self.assertRaisesRegex(ValueError, 'output-file'):
                media.download_clip('https://example.invalid/v', 0, 5, '')

    def test_download_rejects_malformed_audio_lang(self):
        # audio_lang yt-dlp format selector'üne doğrudan gömülür; ']','/'
        # gibi karakterler selector sözdizimini bozup tüm formatı değiştirir.
        with tempfile.TemporaryDirectory() as work:
            for bad in ('en]/best', 'tr+tr', 'en us', '../x'):
                with self.assertRaisesRegex(ValueError, 'ses dili'):
                    media.download('https://example.invalid/v', 1080, bad, work)

    def test_download_stream_rejects_non_http_schemes(self):
        # media.py doğrudan da çağrılabilir; file:///data:/ftp: URL'leri urlopen
        # ile yerel dosya okuyup "video" çıktısına karışırdı.
        for bad in ('file:///etc/passwd', 'data:text/plain,x', 'ftp://h/v',
                    'FILE:///C:/Windows/win.ini'):
            with self.assertRaisesRegex(ValueError, 'http/https'):
                media.download_stream(bad, None, 't', 720, '', '.')

    def test_download_stream_sanitizes_remote_video_id(self):
        # video_id uzak Invidious yanıtından gelir; '/' veya '..' içeren
        # değer geçici/çıktı dosyalarını output-dir dışına yazamaz.
        import io, json, subprocess, urllib.request
        from contextlib import redirect_stdout
        from unittest import mock

        class _Resp:
            headers = {'Content-Length': '4'}
            def __init__(self): self._data = [b'abcd', b'']
            def read(self, _n): return self._data.pop(0)
            def __enter__(self): return self
            def __exit__(self, *a): return False

        def fake_run(cmd, **kw):
            Path(cmd[-1]).write_bytes(b'')
            return type('R', (), {'returncode': 0, 'stderr': ''})()

        with tempfile.TemporaryDirectory() as work:
            out = io.StringIO()
            with mock.patch.object(media, '_find_ffmpeg', return_value='/bin/true'), \
                 mock.patch.object(urllib.request, 'urlopen', side_effect=lambda *a, **k: _Resp()), \
                 mock.patch.object(subprocess, 'run', side_effect=fake_run), \
                 redirect_stdout(out):
                media.download_stream(
                    'https://example.invalid/v', None, 'Test',
                    720, '', work, video_id='../escape/evil',
                )
            path = Path(json.loads(out.getvalue().strip().splitlines()[-1])['path'])
            self.assertNotIn('..', path.name)           # kaçış dizini kırpıldı
            self.assertIn('escapeevil', path.name)      # geçerli karakterler kaldı
            path.resolve().relative_to(Path(work).resolve())  # kaçış yok


class MediaFriendlyOsErrorTests(unittest.TestCase):
    """Windows disk dolu/izin hataları errno ile sınıflanır (metin İngilizce değil)."""

    def test_windows_disk_full_and_permission_by_errno(self):
        import errno
        import media
        disk = OSError(errno.ENOSPC, "There is not enough space on the disk")
        self.assertIn("Disk dolu", media.friendly_os_error(disk))
        win = OSError(22, "Yetersiz alan")
        win.winerror = 112
        self.assertIn("Disk dolu", media.friendly_os_error(win))
        try:
            try:
                raise PermissionError(errno.EACCES, "Erişim engellendi", r"C:\gizli\video.mp4")
            except PermissionError as inner:
                raise RuntimeError("yt-dlp postprocess failed") from inner
        except RuntimeError as wrapped:
            message = media.friendly_os_error(wrapped)
        self.assertIn("yazılamadı", message)
        self.assertNotIn("gizli", message)
        self.assertIsNone(media.friendly_os_error(ValueError("Geçersiz ses dili")))


if __name__ == '__main__':
    unittest.main()
