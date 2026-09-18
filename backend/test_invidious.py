"""
Invidious client testleri.

Invidious API'si reklamsız/gizli YouTube alternatifi sağlar. Bu testler:
- video ID çıkarımı (URL pattern'leri)
- timedtext XML → SRT dönüşümü
- ms → SRT zaman kodu
- varsayılan instance listesi
"""
import os
import sys
import subprocess
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
import invidious


class InvidiousVideoIdExtraction(unittest.TestCase):
    """YouTube URL'sinden video ID çıkarımı."""

    def test_youtube_watch_url(self):
        self.assertEqual(
            invidious.extract_video_id("https://www.youtube.com/watch?v=dQw4w9WgXcQ"),
            "dQw4w9WgXcQ"
        )

    def test_youtu_be_short_url(self):
        self.assertEqual(
            invidious.extract_video_id("https://youtu.be/dQw4w9WgXcQ"),
            "dQw4w9WgXcQ"
        )

    def test_youtube_embed_url(self):
        self.assertEqual(
            invidious.extract_video_id("https://www.youtube.com/embed/dQw4w9WgXcQ"),
            "dQw4w9WgXcQ"
        )

    def test_youtube_shorts_url(self):
        self.assertEqual(
            invidious.extract_video_id("https://www.youtube.com/shorts/dQw4w9WgXcQ"),
            "dQw4w9WgXcQ"
        )

    def test_bare_video_id(self):
        self.assertEqual(
            invidious.extract_video_id("dQw4w9WgXcQ"),
            "dQw4w9WgXcQ"
        )

    def test_invalid_url_raises(self):
        with self.assertRaises(ValueError):
            invidious.extract_video_id("https://example.com/foo")

    def test_url_with_query_params(self):
        self.assertEqual(
            invidious.extract_video_id("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s"),
            "dQw4w9WgXcQ"
        )


class InvidiousMsToSrtTime(unittest.TestCase):
    """Milisaniye → SRT zaman kodu dönüşümü."""

    def test_zero(self):
        self.assertEqual(invidious._ms_to_srt_time(0), "00:00:00,000")

    def test_one_second(self):
        self.assertEqual(invidious._ms_to_srt_time(1000), "00:00:01,000")

    def test_one_minute(self):
        self.assertEqual(invidious._ms_to_srt_time(60_000), "00:01:00,000")

    def test_one_hour(self):
        self.assertEqual(invidious._ms_to_srt_time(3_600_000), "01:00:00,000")

    def test_composite(self):
        # 1 saat 23 dakika 45 saniye 678 ms
        ms = 3_600_000 + 23 * 60_000 + 45_000 + 678
        self.assertEqual(invidious._ms_to_srt_time(ms), "01:23:45,678")

    def test_milliseconds_in_seconds(self):
        self.assertEqual(invidious._ms_to_srt_time(1500), "00:00:01,500")

    def test_negative_clamped_to_zero(self):
        self.assertEqual(invidious._ms_to_srt_time(-100), "00:00:00,000")


class InvidiousTimedtextToSrt(unittest.TestCase):
    """YouTube timedtext XML → SRT dönüşümü."""

    def test_basic_subtitle(self):
        xml = '''<?xml version="1.0" encoding="utf-8"?>
<transcript>
  <body>
    <p t="0" d="2000">Hello world</p>
    <p t="2000" d="3000">This is a test</p>
  </body>
</transcript>'''
        srt = invidious._convert_timedtext_to_srt(xml)
        self.assertIn("1\n00:00:00,000 --> 00:00:02,000\nHello world", srt)
        self.assertIn("2\n00:00:02,000 --> 00:00:05,000\nThis is a test", srt)

    def test_empty_xml_returns_placeholder(self):
        srt = invidious._convert_timedtext_to_srt("<transcript></transcript>")
        self.assertIn("No subtitles", srt)

    def test_invalid_xml_passes_through(self):
        # Bozuk XML düz metin olarak döner (graceful degradation)
        text = "plain text"
        result = invidious._convert_timedtext_to_srt(text)
        # Ya placeholder ya da text döner, her ikisi de kabul edilir
        self.assertIsInstance(result, str)
        self.assertGreater(len(result), 0)

    def test_xml_with_namespace_stripped(self):
        xml = '''<?xml version="1.0" encoding="utf-8"?>
<transcript xmlns="http://www.w3.org/2000/xmlns/">
  <body>
    <p t="1000" d="2000">
      <span>Span text</span>
    </p>
  </body>
</transcript>'''
        srt = invidious._convert_timedtext_to_srt(xml)
        self.assertIn("Span text", srt)


class InvidiousDefaultInstances(unittest.TestCase):
    """Varsayılan Invidious instance listesi."""

    def test_instances_are_https(self):
        for inst in invidious.DEFAULT_INSTANCES:
            self.assertTrue(inst.startswith("https://"), f"HTTP olmayan instance: {inst}")

    def test_instances_are_unique(self):
        self.assertEqual(len(invidious.DEFAULT_INSTANCES), len(set(invidious.DEFAULT_INSTANCES)))

    def test_at_least_5_instances(self):
        # En az 5 yedek instance olmalı (herhangi biri kapalı olabilir)
        self.assertGreaterEqual(len(invidious.DEFAULT_INSTANCES), 5)


class InvidiousSafety(unittest.TestCase):
    """Güvenlik kontrolleri."""

    def test_url_validation_only_http_https(self):
        # decideUrlPolicy main.js'te uygulanıyor, burada sadece
        # extract_video_id'nin javascript: URL'lerini kabul etmediğini doğrula
        with self.assertRaises(ValueError):
            invidious.extract_video_id("javascript:alert(1)")

    def test_invalid_video_id_rejected(self):
        with self.assertRaises(ValueError):
            invidious.extract_video_id("not-a-real-id-with-12-chars")


class InvidiousCmdLine(unittest.TestCase):
    """Komut satırı arayüzü."""

    def test_main_help_exits_clean(self):
        proc = subprocess.run(
            [sys.executable, os.path.join(os.path.dirname(__file__), "..", "backend", "invidious.py"), "--help"],
            capture_output=True, timeout=10,
        )
        self.assertEqual(proc.returncode, 0)
        self.assertIn(b"usage", proc.stdout.lower() + proc.stderr.lower())

    def test_probe_with_invalid_url_returns_error_event(self):
        proc = subprocess.run(
            [sys.executable, os.path.join(os.path.dirname(__file__), "..", "backend", "invidious.py"),
             "probe", "--url", "https://example.com/not-youtube"],
            capture_output=True, timeout=15,
        )
        # Ya exit code != 0 ya da error event yayınlanmış olmalı
        out = proc.stdout.decode("utf-8", errors="replace")
        self.assertTrue(
            '"type": "error"' in out or proc.returncode != 0,
            f"Beklenen error event, stdout: {out!r}, exit={proc.returncode}"
        )


if __name__ == "__main__":
    unittest.main(verbosity=2)
