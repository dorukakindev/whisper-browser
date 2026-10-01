"""R334 — saf-Node dışındaki backend modüllerin kilitsiz fonksiyonları.

Adı hiçbir test dosyasında geçmeyen fonksiyonları sözleşme düzeyinde kilitler.
Nested yardımcılar (media.is_audio, invidious.cap_code, _turkish_clock_match
içindeki hour_words/hour_regex) ait oldukları kamu/kapsayan fonksiyon üzerinden
doğrulanır.
"""

import io
import json
import math
import os
import sys
import tempfile
import unittest
import zipfile
from contextlib import redirect_stdout
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import browser_align
import catalog_scan
import invidious
import io_errors
import live_asr
import ndjson_utils
import pipeline_control
import sentence_translation
import subtitle_sdh
import translation_memory
import update_ytdlp


class IoErrorsLocks(unittest.TestCase):
    def test_parse_ffmpeg_version(self):
        self.assertEqual(io_errors.parse_ffmpeg_version('ffmpeg version n4.4.1'), (4, 4))
        self.assertEqual(io_errors.parse_ffmpeg_version('ffprobe version 6.0-static'), (6, 0))
        self.assertIsNone(io_errors.parse_ffmpeg_version('version yok'))
        self.assertIsNone(io_errors.parse_ffmpeg_version(None))
        self.assertTrue(io_errors.ffmpeg_version_supported('ffmpeg version n4.1'))
        self.assertFalse(io_errors.ffmpeg_version_supported('ffmpeg version n3.9'))


class SdhDescriptorLocks(unittest.TestCase):
    def test_terms_and_rejections(self):
        self.assertTrue(subtitle_sdh.is_sdh_descriptor('Music'))
        self.assertTrue(subtitle_sdh.is_sdh_descriptor('kapı çarpar'))
        self.assertFalse(subtitle_sdh.is_sdh_descriptor('Adam'))          # konuşmacı etiketi
        self.assertFalse(subtitle_sdh.is_sdh_descriptor(''))
        self.assertFalse(subtitle_sdh.is_sdh_descriptor(None))
        self.assertFalse(subtitle_sdh.is_sdh_descriptor('The music is wonderful'))  # gerçek cümle


class NdjsonLocks(unittest.TestCase):
    def test_finite_json_value_nested(self):
        out = ndjson_utils.finite_json_value({'a': [1, float('nan')], 'b': {'c': float('inf')}})
        self.assertEqual(out, {'a': [1, None], 'b': {'c': None}})

    def test_json_dumps_finite_roundtrip(self):
        text = ndjson_utils.json_dumps_finite({'x': float('nan'), 'y': [float('-inf'), 'ç']})
        self.assertEqual(json.loads(text), {'x': None, 'y': [None, 'ç']})
        with self.assertRaises(ValueError):  # allow_nan=False kanıtı — doğrudan dumps
            json.dumps(float('nan'), allow_nan=False)


class PipelineControlLocks(unittest.TestCase):
    def test_job_temp_directory_env(self):
        with tempfile.TemporaryDirectory() as parent:
            os.environ['WHISPER_JOB_TEMP_DIR'] = parent
            try:
                created = pipeline_control.job_temp_directory('wb-test-')
                self.assertTrue(created.startswith(parent + os.sep), created)
                os.rmdir(created)
            finally:
                os.environ.pop('WHISPER_JOB_TEMP_DIR', None)
        created = pipeline_control.job_temp_directory('wb-test-')
        self.assertTrue(Path(created).is_dir())
        os.rmdir(created)


class TranslationMemoryLocks(unittest.TestCase):
    def test_context_key_deterministic(self):
        with tempfile.TemporaryDirectory() as td:
            tm = translation_memory.TranslationMemory(str(Path(td) / 'tm.sqlite'))
            try:
                self.assertEqual(tm.context_key('merhaba'), tm.context_key('merhaba'))
                self.assertNotEqual(tm.context_key('a'), tm.context_key('b'))
                self.assertRegex(tm.context_key('x'), r'^[0-9a-f]{24}$')
                self.assertEqual(tm.context_key(None), tm.context_key(''))
            finally:
                tm.close()


class LiveAsrLocks(unittest.TestCase):
    def test_read_commands(self):
        import queue
        import threading
        commands, stop = queue.Queue(), threading.Event()
        stdin_lines = [
            'bozuk{', '\n',                        # parse hatası → error olayı
            '["degil"]\n',                          # dict değil → error olayı
            '{"type":"chunk","data":[]}\n',         # kuyruğa girer
            '{"type":"stop"}\n',                    # stop_event + break
        ]
        old_stdin, buf = sys.stdin, io.StringIO()
        sys.stdin = io.StringIO(''.join(stdin_lines))
        try:
            with redirect_stdout(buf):
                live_asr.read_commands(commands, stop)
        finally:
            sys.stdin = old_stdin
        self.assertTrue(stop.is_set())
        self.assertEqual(commands.qsize(), 1)
        errors = [json.loads(line) for line in buf.getvalue().splitlines() if '"error"' in line]
        self.assertEqual(len(errors), 2, 'bozuk JSON + non-dict ayrı ayrı error olayı')


class CatalogScanLocks(unittest.TestCase):
    def test_scan_extensions_symlinks_and_cap(self):
        with tempfile.TemporaryDirectory() as td:
            td = Path(td)
            (td / 'Film.2020.1080p.mp4').write_bytes(b'x')
            (td / 'S01E02.Dizi.mkv').write_bytes(b'x')
            (td / 'atla.txt').write_bytes(b'x')
            link = td / 'link.mp4'
            try:
                link.symlink_to(td / 'Film.2020.1080p.mp4')
            except OSError:
                link = None
            out = catalog_scan.scan(str(td))
            self.assertEqual(len(out['rows']), 2, 'uzantı süzgeci + symlink elenir')
            kinds = {r['kind'] for r in out['rows']}
            self.assertIn('film', kinds)
            self.assertIn('series', kinds)
            self.assertIsInstance(out['warnings'], list)


class BrowserAlignLocks(unittest.TestCase):
    def test_valid_cues_matrix(self):
        for bad in [None, 'x', [1], [{'start': 0}], [{'start': 'a', 'end': 1, 't': ''}] * 3,
                    [{'start': 2, 'end': 1}] * 3, [{'start': -1, 'end': 1}] * 3,
                    [{'start': 0, 'end': float('nan')}] * 3, [{'start': 0, 'end': 90000}] * 3]:
            with self.assertRaises(ValueError, msg=str(bad)):
                browser_align.valid_cues(bad)
        out = browser_align.valid_cues([{'start': 0, 'end': 1.5}] * 3)
        self.assertEqual(out, [(0.0, 1.5)] * 3)

    def test_overlap_score(self):
        ref = [(0, 2), (4, 6)]
        self.assertEqual(browser_align.overlap_score(ref, [(0, 2), (4, 6)]), 1.0)
        self.assertEqual(browser_align.overlap_score(ref, [(10, 12)]), 0.0)
        self.assertEqual(browser_align.overlap_score(ref, [(1, 3)]), 0.5)  # 1s örtüşme / 2s toplam
        self.assertEqual(browser_align.overlap_score(ref, []), 0.0)
        self.assertEqual(browser_align.overlap_score(ref, [(5, 10)]), 0.2)


class SentenceTranslationLocks(unittest.TestCase):
    def test_spaceless_and_parts_match(self):
        self.assertTrue(sentence_translation.uses_spaceless_script('こんにちは'))
        self.assertTrue(sentence_translation.uses_spaceless_script('สวัสดี'))
        self.assertFalse(sentence_translation.uses_spaceless_script('Hello'))
        self.assertTrue(sentence_translation.sentence_parts_match('A b c', ['A', 'b c']))
        self.assertFalse(sentence_translation.sentence_parts_match('A b c', ['A', 'x']))
        # CJK hedef: parça sınırına boşluk koymadan tam cümle döndürebilir
        self.assertTrue(sentence_translation.sentence_parts_match('こんにちは', ['こんにちは', '']))

    def test_turkish_clock_match(self):
        m = sentence_translation._turkish_clock_match
        self.assertTrue(m('saat beşte buluşuruz', 5, 0))
        self.assertTrue(m('beşi çeyrek geçe', 5, 15))
        self.assertTrue(m('altıya on kala', 5, 50))
        self.assertFalse(m('yedi buçukta', 5, 30))


class UpdateYtdlpLocks(unittest.TestCase):
    def test_read_active(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            self.assertIsNone(update_ytdlp.read_active(root))
            (root / 'active.json').write_text('bozuk{', encoding='utf-8')
            self.assertIsNone(update_ytdlp.read_active(root))
            (root / 'active.json').write_text('[1]', encoding='utf-8')
            self.assertIsNone(update_ytdlp.read_active(root), 'dict olmayan reddedilir')
            (root / 'active.json').write_text('{"version":"x"}', encoding='utf-8')
            self.assertEqual(update_ytdlp.read_active(root), {'version': 'x'})

    def test_cleanup_stale_staging(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            update_ytdlp.cleanup_stale_staging(root)  # yokken atmaz
            staging = root / 'staging' / 'child'
            staging.mkdir(parents=True)
            (staging / 'f').write_text('x')
            (root / 'staging' / 'loose').write_text('x')
            update_ytdlp.cleanup_stale_staging(root)
            self.assertTrue((root / 'staging').is_dir())
            self.assertFalse(list((root / 'staging').iterdir()), 'içerik temizlendi')

    def test_extract_wheel(self):
        with tempfile.TemporaryDirectory() as td:
            wheel = Path(td) / 'pkg-1.0-py3-none-any.whl'
            with zipfile.ZipFile(wheel, 'w') as z:
                z.writestr('yt_dlp/__init__.py', '')
                z.writestr('yt_dlp/version.py', '__version__="1.0"\n')
            dest = Path(td) / 'out'
            update_ytdlp.extract_wheel(wheel, dest)
            self.assertTrue((dest / 'yt_dlp' / 'version.py').is_file())
            with self.assertRaises(OSError):
                update_ytdlp.extract_wheel(wheel, dest), 'varolan dizin reddedilir'
            bad = Path(td) / 'evil.whl'
            with zipfile.ZipFile(bad, 'w') as z:
                z.writestr('../escape.py', 'x')
            with self.assertRaises(update_ytdlp.UpdateError):
                update_ytdlp.extract_wheel(bad, Path(td) / 'out2')
            too_many = Path(td) / 'big.whl'
            with zipfile.ZipFile(too_many, 'w') as z:
                for i in range(update_ytdlp.MAX_WHEEL_FILES + 1):
                    z.writestr(f'f{i}', '')
            with self.assertRaises(update_ytdlp.UpdateError):
                update_ytdlp.extract_wheel(too_many, Path(td) / 'out3')

    def test_download_artifact(self):
        payload = b'wheel-bytes' * 100
        class _Resp:
            headers = {'Content-Length': str(len(payload))}
            def __init__(self): self._it = iter([payload[:700], payload[700:], b''])
            def read(self, n): return next(self._it)
            def __enter__(self): return self
            def __exit__(self, *a): return False
        with tempfile.TemporaryDirectory() as td:
            dest = Path(td) / 'w.whl'
            import hashlib
            out = update_ytdlp.download_artifact(
                {'url': 'https://x/w.whl', 'sha256': hashlib.sha256(payload).hexdigest()},
                dest, opener=lambda r, timeout: _Resp())
            self.assertEqual(Path(out), dest, 'dönüş hedef yol')
            # hash uyuşmazlığı reddedilir
            with self.assertRaises(update_ytdlp.UpdateError):
                update_ytdlp.download_artifact(
                    {'url': 'https://x/w2.whl', 'sha256': '0' * 64}, Path(td) / 'w2.whl', opener=lambda r, timeout: _Resp())
            self.assertEqual(dest.read_bytes(), payload)
            with self.assertRaises(FileExistsError):
                update_ytdlp.download_artifact({'url': 'https://x/w.whl'}, dest, opener=lambda r, timeout: _Resp())

    def test_validate_runtime(self):
        with tempfile.TemporaryDirectory() as td:
            pkg = Path(td)
            with self.assertRaises(update_ytdlp.UpdateError):
                update_ytdlp.validate_runtime(pkg, '1.0')
            (pkg / 'yt_dlp').mkdir()
            (pkg / 'yt_dlp' / '__init__.py').write_text('')
            fake = type('R', (), {'stdout': 'junk\n2024.12.13\n', 'returncode': 0})
            result = update_ytdlp.validate_runtime(pkg, '2024.12.13', run=lambda *a, **k: fake())
            self.assertEqual(result, '2024.12.13')
            bad = type('R', (), {'stdout': '9.9\n', 'returncode': 0})
            with self.assertRaises(update_ytdlp.UpdateError):
                update_ytdlp.validate_runtime(pkg, '2024.12.13', run=lambda *a, **k: bad())


class InvidiousLocks(unittest.TestCase):
    def test_subscriptions_requires_session(self):
        with self.assertRaises(RuntimeError):
            invidious.feed_subscriptions(instance='http://127.0.0.1:1')

    def test_find_working_instance_raises(self):
        old = invidious._cached_instance
        invidious._cached_instance = None
        try:
            with self.assertRaises(RuntimeError):
                invidious.find_working_instance(instances=['http://127.0.0.1:1'], timeout=0.2)
        finally:
            invidious._cached_instance = old


class BrowserMediaToolsLocks(unittest.TestCase):
    def test_guards(self):
        import browser_media_tools
        # PIL venv'de kurulu → istek doğrulamasına ulaşır
        with self.assertRaises(ValueError):
            browser_media_tools.ocr_frame({'imageBase64': 'x' * (browser_media_tools.MAX_IMAGE_BYTES * 2)})
        with self.assertRaises(ValueError):
            browser_media_tools.ocr_frame({'imageBase64': '!!!notb64'})
        with self.assertRaises(ValueError):
            browser_media_tools.semantic_search({'query': '', 'cues': []})
        with self.assertRaises(ValueError):
            browser_media_tools.semantic_search({'query': 'x', 'cues': [1] * (browser_media_tools.MAX_CUES + 1)})
        out = browser_media_tools.semantic_search({'query': 'kelime', 'cues': []})
        self.assertEqual(out, {'hits': []})


class ModelBenchmarkLocks(unittest.TestCase):
    def test_vram_parse(self):
        import model_benchmark
        fake = type('R', (), {'stdout': '512\n768\n'})
        self.assertEqual(model_benchmark.query_gpu_vram_used_mib(runner=lambda *a, **k: fake()), 512)
        bad = type('R', (), {'stdout': '[N/A]\n'})
        self.assertIsNone(model_benchmark.query_gpu_vram_used_mib(runner=lambda *a, **k: bad()))
        def boom(*a, **k): raise OSError('yok')
        self.assertIsNone(model_benchmark.query_gpu_vram_used_mib(runner=boom))

    def test_wav_duration(self):
        import model_benchmark, wave
        with tempfile.TemporaryDirectory() as td:
            p = Path(td) / 'a.wav'
            with wave.open(str(p), 'wb') as w:
                w.setnchannels(1); w.setsampwidth(2); w.setframerate(16000)
                w.writeframes(b'\0\0' * 16000)
            self.assertAlmostEqual(model_benchmark.wav_duration(str(p)), 1.0, places=3)


class VideoAnalysisLocks(unittest.TestCase):
    def test_detect_intro_guards(self):
        import browser_video_analysis
        with self.assertRaises(ValueError):
            browser_video_analysis.detect_intro({})
        with self.assertRaises(ValueError):
            browser_video_analysis.detect_intro({'audioFiles': ['tek']})
        with self.assertRaises(ValueError):
            browser_video_analysis.detect_intro({'audioFiles': list(range(5))})


if __name__ == '__main__':
    unittest.main(verbosity=1)
