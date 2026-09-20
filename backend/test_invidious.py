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

    def test_empty_xml_raises_instead_of_fake_srt(self):
        # R67-08: boş içerik sahte "No subtitles available" SRT'si yazamaz —
        # gerçek hata fırlatılır, aksi hâlde kullanıcı boş dosyayı altyazı sanır.
        with self.assertRaises(RuntimeError):
            invidious._convert_timedtext_to_srt("<transcript></transcript>")

    def test_invalid_xml_raises(self):
        # Tanınmayan içerik düz metin olarak geçmez — sınıflı hata fırlatılır.
        with self.assertRaises(RuntimeError):
            invidious._convert_timedtext_to_srt("plain text")

    def test_srv1_text_elements(self):
        # srv1: <text start="sn" dur="sn"> — ajan sahadan gelen gerçek format.
        xml = ('<transcript><text start="1.5" dur="2">Hello srv1</text>'
               '<text start="4" dur="1.5">İkinci satır</text></transcript>')
        srt = invidious._convert_timedtext_to_srt(xml)
        self.assertIn("00:00:01,500 --> 00:00:03,500", srt)
        self.assertIn("İkinci satır", srt)

    def test_vtt_content_converts(self):
        vtt = ("WEBVTT\n\n00:00:01.500 --> 00:00:03.500\nHello vtt\n\n"
               "00:00:05.000 --> 00:00:06.000\nSatır iki\n")
        srt = invidious._convert_timedtext_to_srt(vtt)
        self.assertIn("00:00:01,500 --> 00:00:03,500", srt)
        self.assertIn("Satır iki", srt)

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

    def test_popular_command_emits_feed_event(self):
        # Ağ çağrısı yapacağı için sadece çalıştırılabilirlik kontrolü
        # (ortamda Invidious yoksa hata event'i yayınlar)
        proc = subprocess.run(
            [sys.executable, os.path.join(os.path.dirname(__file__), "..", "backend", "invidious.py"),
             "popular"],
            capture_output=True, timeout=30,
        )
        out = proc.stdout.decode("utf-8", errors="replace")
        # feed ya da error event yayınlanmalı
        self.assertTrue(
            '"type": "feed"' in out or '"type": "error"' in out,
            f"Beklenen feed/error event, stdout: {out!r}"
        )

    def test_login_command_with_empty_credentials_returns_error(self):
        proc = subprocess.run(
            [sys.executable, os.path.join(os.path.dirname(__file__), "..", "backend", "invidious.py"),
             "login", "--username", "", "--password", ""],
            capture_output=True, timeout=30,
        )
        out = proc.stdout.decode("utf-8", errors="replace")
        # Boş kullanıcı adı/şifre — Invidious sunucu 401 döner veya boş şifre exception
        self.assertTrue(
            '"type": "error"' in out or proc.returncode != 0,
            f"Beklenen error, stdout: {out!r}, exit={proc.returncode}"
        )

    def test_logout_command_runs_clean(self):
        proc = subprocess.run(
            [sys.executable, os.path.join(os.path.dirname(__file__), "..", "backend", "invidious.py"),
             "logout"],
            capture_output=True, timeout=15,
        )
        out = proc.stdout.decode("utf-8", errors="replace")
        self.assertIn('"type": "logout"', out)
        self.assertIn('"ok": true', out)


class InvidiousAuth(unittest.TestCase):
    """Auth (login/logout) yardımcıları."""

    def test_set_session_clears(self):
        """set_session None ile çağrılınca temizlenir."""
        invidious.set_session(cookie="test_sid", username="test_user")
        self.assertEqual(invidious._session_cookie, "test_sid")
        self.assertEqual(invidious._session_username, "test_user")
        invidious.set_session(cookie=None, username=None)
        self.assertIsNone(invidious._session_cookie)
        self.assertIsNone(invidious._session_username)

    def test_auth_headers_without_session(self):
        invidious.set_session(cookie=None, username=None)
        headers = invidious._auth_headers()
        self.assertNotIn("Cookie", headers)
        self.assertIn("User-Agent", headers)

    def test_auth_headers_with_session(self):
        invidious.set_session(cookie="abc123", username="u")
        try:
            headers = invidious._auth_headers()
            self.assertEqual(headers.get("Cookie"), "SID=abc123")
        finally:
            invidious.set_session(cookie=None, username=None)

    def test_auth_headers_no_leak_to_other_instance(self):
        """SID, failover ile farklı instance'a düşen isteğe eklenmemeli."""
        invidious.set_session(cookie="abc123", username="u",
                              instance="https://good.example.com")
        try:
            same = invidious._auth_headers("https://good.example.com/api/v1/auth/feed")
            self.assertEqual(same.get("Cookie"), "SID=abc123")
            other = invidious._auth_headers("https://evil.example.com/api/v1/auth/feed")
            self.assertNotIn("Cookie", other)
        finally:
            invidious.set_session(cookie=None, username=None)

    def test_auth_headers_no_instance_no_leak(self):
        """Instance bilinmiyorken URL'li isteğe SID sızdırma (fail-safe)."""
        invidious.set_session(cookie="abc123", username="u")
        try:
            headers = invidious._auth_headers("https://unknown.example.com/api/v1")
            self.assertNotIn("Cookie", headers)
        finally:
            invidious.set_session(cookie=None, username=None)


class InvidiousFeedParsing(unittest.TestCase):
    """Feed/video item parsing."""

    def test_parse_video_item_minimal(self):
        v = invidious._parse_video_item({
            "videoId": "abc12345678",
            "title": "Test",
            "author": "Channel",
        })
        self.assertEqual(v["videoId"], "abc12345678")
        self.assertEqual(v["title"], "Test")
        self.assertEqual(v["author"], "Channel")
        self.assertEqual(v["lengthSeconds"], 0)
        self.assertEqual(v["viewCount"], 0)

    def test_parse_video_item_full(self):
        v = invidious._parse_video_item({
            "videoId": "x",
            "title": "t",
            "author": "a",
            "lengthSeconds": 600,
            "viewCount": 12345,
            "videoThumbnails": [{"url": "https://example.com/t.jpg", "quality": "medium"}],
        })
        self.assertEqual(v["lengthSeconds"], 600)
        self.assertEqual(v["viewCount"], 12345)
        self.assertEqual(len(v["videoThumbnails"]), 1)

    def test_parse_video_item_with_nonascii(self):
        v = invidious._parse_video_item({
            "videoId": "tr1",
            "title": "Türkçe başlık: ğüşı",
            "author": "Kanal",
        })
        self.assertIn("Türkçe", v["title"])


class InvidiousChannelIdValidation(unittest.TestCase):
    """Kanal ID format validasyonu (main.js'te yapılır)."""

    def test_valid_ucid_pattern(self):
        # Invidious UCID = UC + 22 alphanumeric
        import re
        pattern = r"^[A-Za-z0-9_-]{2,40}$"
        self.assertRegex("UCabcdefghijklmnopqrstuv", pattern)
        self.assertRegex("UC12345678", pattern)
        self.assertRegex("UC_x-1", pattern)

    def test_invalid_ucid_rejected(self):
        import re
        pattern = r"^[A-Za-z0-9_-]{2,40}$"
        self.assertNotRegex("javascript:alert(1)", pattern)
        self.assertNotRegex("", pattern)
        self.assertNotRegex("../etc/passwd", pattern)


class InvidiousVideoIdExtractionR67(unittest.TestCase):
    """R67: genişletilmiş URL varyantları (nocookie, live, instance, param sırası)."""

    def test_nocookie_embed(self):
        self.assertEqual(
            invidious.extract_video_id("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"),
            "dQw4w9WgXcQ")

    def test_live_path(self):
        self.assertEqual(
            invidious.extract_video_id("https://www.youtube.com/live/dQw4w9WgXcQ"),
            "dQw4w9WgXcQ")

    def test_v_param_not_first(self):
        # ?list=...&v=... sırası — eski pattern v'nin ilk parametre olmasını beklerdi
        self.assertEqual(
            invidious.extract_video_id("https://www.youtube.com/watch?list=PLx&v=dQw4w9WgXcQ"),
            "dQw4w9WgXcQ")

    def test_invidious_instance_watch_url(self):
        # Instance URL'leri YouTube yol yapısını aynalar — karttaki /watch?v= linki çalışmalı
        for host in ("https://yewtu.be", "https://inv.nadeko.net", "https://vid.priv.au"):
            self.assertEqual(
                invidious.extract_video_id(f"{host}/watch?v=dQw4w9WgXcQ"),
                "dQw4w9WgXcQ", host)


class InvidiousNumericGuards(unittest.TestCase):
    """Invidious API sayıları string/float döndürebilir — _to_int koruması."""

    def test_to_int_variants(self):
        self.assertEqual(invidious._to_int("42"), 42)
        self.assertEqual(invidious._to_int("1234.0"), 1234)
        self.assertEqual(invidious._to_int(None), 0)
        self.assertEqual(invidious._to_int("abc"), 0)
        self.assertEqual(invidious._to_int(7), 7)

    def test_parse_video_item_string_numbers(self):
        v = invidious._parse_video_item({
            "videoId": "x", "title": "t", "author": "a",
            "lengthSeconds": "120", "viewCount": "5.0",
        })
        self.assertEqual(v["lengthSeconds"], 120)
        self.assertEqual(v["viewCount"], 5)


class InvidiousAbsUrl(unittest.TestCase):
    """Instance-göreli URL'lerin mutlaklaştırılması."""

    def test_relative_path(self):
        self.assertEqual(invidious._abs_url("https://i.test", "/vi/x.jpg"),
                         "https://i.test/vi/x.jpg")

    def test_protocol_relative(self):
        self.assertEqual(invidious._abs_url("https://i.test", "//h/x.jpg"),
                         "https://h/x.jpg")

    def test_absolute_passthrough(self):
        self.assertEqual(invidious._abs_url("https://i.test", "https://h/x.jpg"),
                         "https://h/x.jpg")

    def test_empty(self):
        self.assertEqual(invidious._abs_url("https://i.test", ""), "")


class InvidiousCommentParsing(unittest.TestCase):
    """Yorum parsing — HTML etiketleri soyulur, düz metin kalır."""

    def test_parse_comment_strips_html(self):
        c = invidious._parse_comment({
            "author": "u",
            "content": "<a href=\"/x\">link</a> <b>kalın</b> &amp; &lt;3",
            "likeCount": "42",
            "publishedText": "2 days ago",
        })
        self.assertEqual(c["author"], "u")
        self.assertEqual(c["text"], "link kalın & <3")
        self.assertEqual(c["likeCount"], 42)

    def test_parse_comment_reply_count(self):
        c = invidious._parse_comment({"author": "u", "content": "t",
                                      "replies": {"replyCount": 7}})
        self.assertEqual(c["replies"], 7)


class InvidiousCommentsCommand(unittest.TestCase):
    """comments() — emit sözleşmesi ve hata yolları (ağ mock'lu)."""

    def test_comments_emits_parsed_items(self):
        import unittest.mock as mock
        payload = {"comments": [
            {"author": "a", "content": "<b>x</b>", "likeCount": 3},
            "bozuk-eleman",
            {"author": "b", "content": "y"},
        ], "continuation": "tok123"}
        events = []
        with mock.patch.object(invidious, "_fetch_with_failover",
                               return_value=(payload, "https://i.test")), \
             mock.patch.object(invidious, "emit",
                               lambda t, **kw: events.append((t, kw))):
            invidious.comments("dQw4w9WgXcQ")
        self.assertEqual(events[0][0], "comments")
        data = events[0][1]
        self.assertEqual(data["videoId"], "dQw4w9WgXcQ")
        self.assertEqual(len(data["comments"]), 2)   # bozuk eleman atlandı
        self.assertEqual(data["comments"][0]["text"], "x")
        self.assertEqual(data["continuation"], "tok123")

    def test_comments_disabled_flag(self):
        import unittest.mock as mock
        events = []
        with mock.patch.object(invidious, "_fetch_with_failover",
                               return_value=({"disabled": True}, "https://i.test")), \
             mock.patch.object(invidious, "emit",
                               lambda t, **kw: events.append((t, kw))):
            invidious.comments("dQw4w9WgXcQ")
        self.assertTrue(events[0][1]["disabled"])

    def test_comments_invalid_video_id(self):
        # extract_video_id ValueError atar; main() genel Exception yakalayıp
        # error event emit eder — ikisi de reddedildiğinin kanıtı.
        with self.assertRaises((ValueError, RuntimeError)):
            invidious.comments("javascript:alert(1)")


class InvidiousPlaylistCommand(unittest.TestCase):
    """playlist() — ID doğrulama + emit sözleşmesi."""

    def test_playlist_id_validation(self):
        for bad in ["", None, "a;b", "../x", "id with spaces", "x" * 201]:
            with self.assertRaises(RuntimeError, msg=f"kabul edilmemeli: {bad!r}"):
                invidious.playlist(bad)

    def test_playlist_emits_videos(self):
        import unittest.mock as mock
        payload = {"title": "PL", "author": "ch", "videoCount": 2,
                   "videos": [{"videoId": "v1", "title": "t1"},
                              {"videoId": "v2", "title": "t2"}]}
        events = []
        with mock.patch.object(invidious, "_fetch_with_failover",
                               return_value=(payload, "https://i.test")), \
             mock.patch.object(invidious, "emit",
                               lambda t, **kw: events.append((t, kw))):
            invidious.playlist("PLabcdef123")
        data = events[0][1]
        self.assertEqual(events[0][0], "playlist")
        self.assertEqual(data["title"], "PL")
        self.assertEqual(len(data["videos"]), 2)
        self.assertEqual(data["videos"][0]["videoId"], "v1")


class InvidiousTrendTabFallback(unittest.TestCase):
    """feed_trending — tab seçimi + gerçek-feed yt-dlp yedeği + degraded bayrağı."""

    def test_tab_limits_to_single_category(self):
        import unittest.mock as mock
        calls = []
        def fake_fetch(path, **kw):
            calls.append(path)
            return ([{"videoId": "v", "title": "t"}], "https://i.test")
        events = []
        with mock.patch.object(invidious, "_fetch_with_failover", fake_fetch), \
             mock.patch.object(invidious, "emit",
                               lambda t, **kw: events.append((t, kw))):
            invidious.feed_trending(tab="music")
        self.assertEqual(calls, ["/api/v1/trending?type=music"])
        self.assertEqual(events[0][1].get("tab"), "music")

    def test_no_tab_fetches_all_categories(self):
        import unittest.mock as mock
        calls = []
        def fake_fetch(path, **kw):
            calls.append(path)
            return ([], "https://i.test")
        with mock.patch.object(invidious, "_fetch_with_failover", fake_fetch), \
             mock.patch.object(invidious, "_ytdlp_tab_videos", return_value=[{"videoId": "x"}]), \
             mock.patch.object(invidious, "emit", lambda *a, **kw: None):
            invidious.feed_trending()
        self.assertEqual(len(calls), 4)
        self.assertTrue(all("trending?type=" in c for c in calls))

    def test_fallback_marks_degraded(self):
        import unittest.mock as mock
        events = []
        def boom(path, **kw):
            raise RuntimeError("instance ölü")
        with mock.patch.object(invidious, "_fetch_with_failover", boom), \
             mock.patch.object(invidious, "_ytdlp_tab_videos",
                               return_value=[{"videoId": "x"}]) as tab_fn, \
             mock.patch.object(invidious, "emit",
                               lambda t, **kw: events.append((t, kw))):
            invidious.feed_trending()
        # ytsearch meta-çöp değil gerçek feed sayfası çağrılır
        args, _ = tab_fn.call_args
        self.assertIn("feed/trending", args[0])
        # log() da emit çağırır — feed event'ini bul
        data = next(kw for t, kw in events if t == "feed")
        self.assertTrue(data["degraded"])
        self.assertEqual(data["source"], "yt-dlp")


class InvidiousYtdlpTabVideos(unittest.TestCase):
    """_ytdlp_tab_videos — flat entry'ler video şemasına çevrilir."""

    def test_filters_non_video_and_bad_ids(self):
        import unittest.mock as mock
        info = {"entries": [
            {"_type": "video", "id": "abc12345678", "title": "ok",
             "uploader": "ch", "duration": 60},
            {"_type": "playlist", "id": "PLxxx"},
            {"_type": "video", "id": "kısa", "title": "kısa id atlanır"},
            None,
        ]}
        with mock.patch.object(invidious, "_YT_DLP_AVAILABLE", True), \
             mock.patch.object(invidious.yt_dlp, "YoutubeDL") as ydl_cls:
            inst = ydl_cls.return_value.__enter__.return_value
            inst.extract_info.return_value = info
            out = invidious._ytdlp_tab_videos("https://www.youtube.com/feed/trending")
        self.assertEqual(len(out), 1)
        self.assertEqual(out[0]["videoId"], "abc12345678")
        self.assertEqual(out[0]["author"], "ch")
        self.assertEqual(out[0]["lengthSeconds"], 60)


class InvidiousHomeProgress(unittest.TestCase):
    def test_first_completed_branch_is_emitted_before_slow_branch(self):
        import time
        from unittest import mock

        events = []

        def slow_trending(_instance, _tab):
            time.sleep(0.05)
            return {"videos": [{"videoId": "trend"}], "instance": "https://example.test"}

        with mock.patch.object(invidious, "_popular_payload", return_value={
                "videos": [{"videoId": "popular"}], "instance": "https://example.test"}), \
             mock.patch.object(invidious, "_trending_payload", slow_trending), \
             mock.patch.object(invidious, "emit", lambda typ, **kw: events.append((typ, kw))):
            invidious.feed_home()

        self.assertEqual([event[0] for event in events],
                         ["feed_partial", "feed_partial", "feed"])
        self.assertEqual(events[0][1]["section"], "popular")
        self.assertEqual(events[-1][1]["popular"]["videos"][0]["videoId"], "popular")


class InvidiousSuggestions(unittest.TestCase):
    """A23 — /api/v1/search/suggestions sözleşmesi."""

    def test_suggestions_event_and_instance(self):
        from unittest import mock
        events = []
        with mock.patch.object(invidious, "_fetch_with_failover",
                               return_value=({"query": "lo", "suggestions": ["lofi", "lofi girl",
                                                                              "", None, 7]},
                                             "https://inst.test")), \
             mock.patch.object(invidious, "emit", lambda typ, **kw: events.append((typ, kw))):
            invidious.suggest("lo")
        self.assertEqual(events[0][0], "suggestions")
        self.assertEqual(events[0][1]["suggestions"], ["lofi", "lofi girl", "7"])
        self.assertEqual(events[0][1]["instance"], "https://inst.test")

    def test_empty_query_short_circuits(self):
        events = []
        from unittest import mock
        with mock.patch.object(invidious, "emit", lambda typ, **kw: events.append((typ, kw))):
            invidious.suggest("   ")
        self.assertEqual(events, [("suggestions", {"query": "", "suggestions": [], "instance": ""})])

    def test_list_payload_also_accepted(self):
        from unittest import mock
        events = []
        with mock.patch.object(invidious, "_fetch_with_failover",
                               return_value=(["a", "b"], "https://inst.test")), \
             mock.patch.object(invidious, "emit", lambda typ, **kw: events.append((typ, kw))):
            invidious.suggest("x")
        self.assertEqual(events[0][1]["suggestions"], ["a", "b"])


class InvidiousPlaylistSearch(unittest.TestCase):
    """A28 — type=playlist / features sözleşmesi + playlist şeması."""

    def test_playlist_items_parsed(self):
        from unittest import mock
        events = []
        payload = [
            {"type": "playlist", "playlistId": "PLabc_-12", "title": "Miks",
             "author": "Kanal", "authorId": "UCaaaaaaaaaaaaaaaaaaaaaa",
             "videoCount": 42,
             "playlistThumbnails": [{"url": "https://i.test/t.jpg", "width": 100, "height": 56}]},
            {"type": "video", "videoId": "vid12345678", "title": "v"},
            {"type": "playlist"},   # playlistId'siz düşer
        ]
        seen_url = {}
        def fake_fetch(path, preferred=None, timeout=15):
            seen_url["path"] = path
            return payload, "https://inst.test"
        with mock.patch.object(invidious, "_fetch_with_failover", fake_fetch), \
             mock.patch.object(invidious, "emit", lambda typ, **kw: events.append((typ, kw))):
            invidious.search("miks", search_type="playlist")
        self.assertIn("type=playlist", seen_url["path"])
        ev = next(e for t, e in events if t == "search")
        self.assertEqual(ev["videos"], [])
        self.assertEqual(len(ev["playlists"]), 1)
        pl = ev["playlists"][0]
        self.assertEqual(pl["playlistId"], "PLabc_-12")
        self.assertEqual(pl["videoCount"], 42)
        self.assertEqual(pl["videoThumbnails"][0]["url"], "https://i.test/t.jpg")

    def test_features_live_in_url(self):
        from unittest import mock
        seen = {}
        def fake_fetch(path, preferred=None, timeout=15):
            seen["path"] = path
            return [{"type": "video", "videoId": "l1234567890", "title": "x", "liveNow": True}], "i"
        events = []
        with mock.patch.object(invidious, "_fetch_with_failover", fake_fetch), \
             mock.patch.object(invidious, "emit", lambda typ, **kw: events.append((typ, kw))):
            invidious.search("live", features="live,bogus")
        self.assertIn("features=live", seen["path"])
        self.assertNotIn("bogus", seen["path"])   # whitelist dışı süzgeç gitmez

    def test_playlist_emit_fields(self):
        from unittest import mock
        events = []
        payload = {"title": "T", "author": "A", "authorId": "UCx",
                   "videoCount": 3,
                   "videos": [{"videoId": "a1234567890", "title": "v1"}]}
        with mock.patch.object(invidious, "_fetch_with_failover",
                               return_value=(payload, "https://inst.test")), \
             mock.patch.object(invidious, "emit", lambda typ, **kw: events.append((typ, kw))):
            invidious.playlist("PLx", page=2)
        ev = next(e for e in events if e[0] == "playlist")
        self.assertEqual(ev[0], "playlist")
        self.assertEqual(ev[1]["videoCount"], 3)
        self.assertEqual(ev[1]["videos"][0]["videoId"], "a1234567890")

    def test_playlist_id_validated(self):
        with self.assertRaises(RuntimeError):
            invidious.playlist("../../etc")


class InvidiousChannelTab(unittest.TestCase):
    """A27 — kanal sekme uçları."""

    def test_tab_paths_and_whitelist(self):
        from unittest import mock
        seen = []
        def fake_fetch(path, preferred=None, timeout=15):
            seen.append(path)
            return {"videos": [{"videoId": "a1234567890", "title": "v"}],
                    "continuation": ""}, "i"
        events = []
        with mock.patch.object(invidious, "_fetch_with_failover", fake_fetch), \
             mock.patch.object(invidious, "emit", lambda typ, **kw: events.append((typ, kw))):
            invidious.channel_tab("UCaaaaaaaaaaaaaaaaaaaaaa", tab="shorts", page=2)
            with self.assertRaises(RuntimeError):
                invidious.channel_tab("UCaaaaaaaaaaaaaaaaaaaaaa", tab="bogus")
            invidious.channel_tab("UCaaaaaaaaaaaaaaaaaaaaaa", query="içinde")
        self.assertIn("/shorts?page=2", seen[0])
        self.assertIn("/search?q=", seen[1])
        ev = next(e for t, e in events if t == "channel_tab" and e["tab"] == "search")
        self.assertEqual(ev["query"], "içinde")

    def test_community_and_channels_shapes(self):
        from unittest import mock
        events = []
        def fake_fetch(path, preferred=None, timeout=15):
            if path.endswith("/community"):
                return {"comments": [{"author": "a", "content": "<b>merhaba</b>"}]}, "i"
            return {"channels": [{"authorId": "UCbbbbbbbbbbbbbbbbbbbbbb",
                                  "author": "Ch", "subCount": 10}]}, "i"
        with mock.patch.object(invidious, "_fetch_with_failover", fake_fetch), \
             mock.patch.object(invidious, "emit", lambda typ, **kw: events.append((typ, kw))):
            invidious.channel_tab("UCaaaaaaaaaaaaaaaaaaaaaa", tab="community")
            invidious.channel_tab("UCaaaaaaaaaaaaaaaaaaaaaa", tab="channels")
        com = next(e for t, e in events if t == "channel_tab" and e["tab"] == "community")
        self.assertEqual(com["comments"][0]["text"], "merhaba")   # HTML soyuldu
        rel = next(e for t, e in events if t == "channel_tab" and e["tab"] == "channels")
        self.assertEqual(rel["channels"][0]["author"], "Ch")

    def test_bad_channel_id_rejected(self):
        with self.assertRaises(RuntimeError):
            invidious.channel_tab("../x", tab="videos")


if __name__ == "__main__":
    unittest.main(verbosity=2)
