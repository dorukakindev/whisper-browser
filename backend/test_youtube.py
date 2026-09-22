"""
YouTube OAuth (cihaz akışı) + InnerTube köprüsü testleri.

Tüm ağ çağrıları mock'lanır — gerçek Google/YouTube erişimi gerektirmez.
Kapsam:
- device_code emit şeması
- poll döngüsü (authorization_pending → login, access_denied → hata)
- refresh token yenileme
- browse videoRenderer → SmartTube kart şeması + continuation
- browse_id beyaz listesi (main dispatch)
- env-kanalı: gizli değerler argv'den okunmaz
"""
import io
import json
import os
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
import youtube


def _capture_emit(fn, *args, **kwargs):
    """fn çalışırken emit() çıktısını event listesi olarak toplar."""
    events = []
    with patch.object(youtube, "emit", lambda t, **kw: events.append({"type": t, **kw})):
        fn(*args, **kwargs)
    return events


class DeviceCode(unittest.TestCase):
    def test_device_code_emits_user_facing_fields(self):
        resp = {
            "device_code": "DC-SECRET",
            "user_code": "ABCD-EFGH",
            "verification_url": "https://www.google.com/device",
            "expires_in": 1800,
            "interval": 5,
        }
        with patch.object(youtube, "_post_form", return_value=(resp, None)) as m:
            events = _capture_emit(youtube.device_code, "CID")
        self.assertEqual(len(events), 1)
        ev = events[0]
        self.assertEqual(ev["type"], "device_code")
        self.assertEqual(ev["user_code"], "ABCD-EFGH")
        self.assertEqual(ev["verification_url"], "https://www.google.com/device")
        # device_code ana süreçte kalması gereken alan — emit'te var ama
        # renderer'a iletilmez (main.js tarafı filtreler)
        self.assertEqual(ev["device_code"], "DC-SECRET")
        # Salt-okuma uygulaması hesap yönetme izni istememeli.
        fields = m.call_args[0][1]
        self.assertEqual(fields["scope"],
                         "https://www.googleapis.com/auth/youtube.readonly")

    def test_device_code_error_raises(self):
        with patch.object(youtube, "_post_form",
                          return_value=(None, {"error": "invalid_client",
                                               "error_description": "bad client"})):
            with self.assertRaises(RuntimeError):
                _capture_emit(youtube.device_code, "CID")


class Poll(unittest.TestCase):
    def _env(self):
        return {"WHISPER_YT_CLIENT_SECRET": "SEC", "WHISPER_YT_DEVICE_CODE": "DC"}

    def test_poll_pending_then_login(self):
        seq = [
            (None, {"error": "authorization_pending"}),
            ({"access_token": "AT", "refresh_token": "RT", "expires_in": 3600}, None),
        ]
        calls = iter(seq)
        with patch.dict(os.environ, self._env(), clear=False), \
             patch.object(youtube, "_post_form", side_effect=lambda *a, **k: next(calls)), \
             patch.object(youtube.time, "sleep", lambda s: None), \
             patch.object(youtube, "_fetch_me", return_value={"name": "Kanal"}):
            events = _capture_emit(youtube.poll, "CID", expires_in=60, interval=3)
        login = [e for e in events if e["type"] == "login"]
        self.assertEqual(len(login), 1)
        self.assertEqual(login[0]["refresh_token"], "RT")
        self.assertEqual(login[0]["user_name"], "Kanal")

    def test_poll_access_denied_raises(self):
        with patch.dict(os.environ, self._env(), clear=False), \
             patch.object(youtube, "_post_form",
                          return_value=(None, {"error": "access_denied"})), \
             patch.object(youtube.time, "sleep", lambda s: None):
            with self.assertRaises(RuntimeError) as cm:
                _capture_emit(youtube.poll, "CID", expires_in=60, interval=3)
        self.assertIn("reddetti", str(cm.exception))

    def test_poll_slow_down_increases_delay(self):
        seq = [
            (None, {"error": "slow_down"}),
            ({"access_token": "AT", "refresh_token": "RT"}, None),
        ]
        calls = iter(seq)
        sleeps = []
        with patch.dict(os.environ, self._env(), clear=False), \
             patch.object(youtube, "_post_form", side_effect=lambda *a, **k: next(calls)), \
             patch.object(youtube.time, "sleep", lambda s: sleeps.append(s)), \
             patch.object(youtube, "_fetch_me", return_value=None):
            _capture_emit(youtube.poll, "CID", expires_in=60, interval=3)
        self.assertGreaterEqual(sleeps[-1], 8)  # 3 + 5 slow_down artışı

    def test_poll_missing_device_code_raises(self):
        env = {k: v for k, v in os.environ.items() if k != "WHISPER_YT_DEVICE_CODE"}
        with patch.dict(os.environ, env, clear=True):
            with self.assertRaises(RuntimeError):
                _capture_emit(youtube.poll, "CID")


class ExchangeCode(unittest.TestCase):
    """Loopback (tarayıcı) akışı — masaüstü uygulamalar için önerilen yol."""

    def _env(self):
        return {"WHISPER_YT_CLIENT_SECRET": "SEC",
                "WHISPER_YT_AUTH_CODE": "CODE-1",
                "WHISPER_YT_CODE_VERIFIER": "VER-1",
                "WHISPER_YT_REDIRECT_URI": "http://127.0.0.1:4321/oauth2callback"}

    def test_exchange_code_sends_pkce_and_emits_login(self):
        with patch.dict(os.environ, self._env(), clear=False), \
             patch.object(youtube, "_post_form",
                          return_value=({"access_token": "AT", "refresh_token": "RT",
                                         "expires_in": 3600}, None)) as m, \
             patch.object(youtube, "_fetch_me", return_value={"name": "Kanal"}):
            events = _capture_emit(youtube.exchange_code, "CID")
        fields = m.call_args[0][1]
        self.assertEqual(fields["grant_type"], "authorization_code")
        self.assertEqual(fields["code"], "CODE-1")
        self.assertEqual(fields["code_verifier"], "VER-1")
        self.assertEqual(fields["redirect_uri"], "http://127.0.0.1:4321/oauth2callback")
        self.assertEqual(fields["client_secret"], "SEC")
        login = [e for e in events if e["type"] == "login"]
        self.assertEqual(len(login), 1)
        self.assertEqual(login[0]["refresh_token"], "RT")

    def test_exchange_code_missing_env_raises(self):
        env = {k: v for k, v in os.environ.items()
               if not k.startswith("WHISPER_YT_")}
        with patch.dict(os.environ, env, clear=True):
            with self.assertRaises(RuntimeError):
                _capture_emit(youtube.exchange_code, "CID")

    def test_exchange_code_invalid_grant_raises(self):
        with patch.dict(os.environ, self._env(), clear=False), \
             patch.object(youtube, "_post_form",
                          return_value=(None, {"error": "invalid_grant"})):
            with self.assertRaises(RuntimeError) as cm:
                _capture_emit(youtube.exchange_code, "CID")
        self.assertIn("reddedildi", str(cm.exception))


class Refresh(unittest.TestCase):
    def test_refresh_emits_token(self):
        with patch.dict(os.environ,
                        {"WHISPER_YT_CLIENT_SECRET": "S", "WHISPER_YT_REFRESH_TOKEN": "RT"},
                        clear=False), \
             patch.object(youtube, "_post_form",
                          return_value=({"access_token": "AT2", "expires_in": 3600}, None)):
            events = _capture_emit(youtube.refresh, "CID")
        self.assertEqual(events[0]["type"], "token")
        self.assertEqual(events[0]["access_token"], "AT2")

    def test_refresh_invalid_grant_raises(self):
        with patch.dict(os.environ,
                        {"WHISPER_YT_CLIENT_SECRET": "S", "WHISPER_YT_REFRESH_TOKEN": "RT"},
                        clear=False), \
             patch.object(youtube, "_post_form",
                          return_value=(None, {"error": "invalid_grant"})):
            with self.assertRaises(RuntimeError) as cm:
                _capture_emit(youtube.refresh, "CID")
        self.assertIn("invalid_grant", str(cm.exception))


class Parsers(unittest.TestCase):
    def test_runs_text(self):
        self.assertEqual(youtube._runs_text({"simpleText": "x"}), "x")
        self.assertEqual(
            youtube._runs_text({"runs": [{"text": "a"}, {"text": "b"}]}), "ab")
        self.assertEqual(youtube._runs_text(None), "")

    def test_length_seconds(self):
        self.assertEqual(youtube._length_seconds("1:02:03"), 3723)
        self.assertEqual(youtube._length_seconds("4:05"), 245)
        self.assertEqual(youtube._length_seconds(""), 0)

    def test_view_count(self):
        self.assertEqual(youtube._view_count("1,234,567 görüntüleme"), 1234567)
        self.assertEqual(youtube._view_count("1.2B views"), 1200000000)
        self.assertEqual(youtube._view_count("1,2 B görüntüleme"), 1200)
        self.assertEqual(youtube._view_count("3,4 Mn görüntüleme"), 3400000)
        self.assertEqual(youtube._view_count("987K views"), 987000)
        self.assertEqual(youtube._view_count(""), 0)

    def test_revoke_reports_remote_result_without_exposing_token(self):
        class Response:
            status = 200
            def __enter__(self): return self
            def __exit__(self, *_): return False
        with patch.dict(os.environ, {"WHISPER_YT_REFRESH_TOKEN": "RT-SECRET",
                                  "WHISPER_YT_ACCESS_TOKEN": "AT-SECRET"}), \
             patch.object(youtube, "urlopen", return_value=Response()) as opened:
            events = _capture_emit(youtube.revoke)
        self.assertEqual(events, [{"type": "revoked", "remote_ok": True}])
        self.assertIn(b"RT-SECRET", opened.call_args.args[0].data)
        self.assertNotIn("RT-SECRET", repr(events))
        with patch.dict(os.environ, {"WHISPER_YT_REFRESH_TOKEN": "RT-SECRET"}), \
             patch.object(youtube, "urlopen", side_effect=OSError("offline")):
            events = _capture_emit(youtube.revoke)
        self.assertEqual(events, [{"type": "revoked", "remote_ok": False}])
        with patch.dict(os.environ, {"WHISPER_YT_REFRESH_TOKEN": "", "WHISPER_YT_ACCESS_TOKEN": ""}):
            events = _capture_emit(youtube.revoke)
        self.assertEqual(events, [{"type": "revoked", "remote_ok": False}])
        from urllib.error import HTTPError
        with patch.dict(os.environ, {"WHISPER_YT_REFRESH_TOKEN": "RT-SECRET"}), \
             patch.object(youtube, "urlopen", side_effect=HTTPError(
                 "https://oauth2.googleapis.com/revoke", 400, "invalid_token", {}, None)):
            events = _capture_emit(youtube.revoke)
        self.assertEqual(events, [{"type": "revoked", "remote_ok": False}])

    def test_vr_to_card_schema(self):
        vr = {
            "videoId": "VID123",
            "title": {"runs": [{"text": "Başlık"}]},
            "ownerText": {"runs": [{
                "text": "Kanal",
                "navigationEndpoint": {"browseEndpoint": {"browseId": "UCx"}},
            }]},
            "publishedTimeText": {"simpleText": "2 gün önce"},
            "lengthText": {"simpleText": "10:00"},
            "viewCountText": {"simpleText": "1,000 görüntüleme"},
            "thumbnail": {"thumbnails": [
                {"url": "https://i.ytimg.com/vi/VID123/small.jpg", "width": 120},
                {"url": "https://i.ytimg.com/vi/VID123/mid.jpg", "width": 320},
            ]},
        }
        card = youtube._vr_to_card(vr)
        self.assertEqual(card["videoId"], "VID123")
        self.assertEqual(card["title"], "Başlık")
        self.assertEqual(card["author"], "Kanal")
        self.assertEqual(card["authorId"], "UCx")
        self.assertEqual(card["lengthSeconds"], 600)
        self.assertEqual(card["viewCount"], 1000)
        self.assertEqual(card["videoThumbnails"][0]["url"],
                         "https://i.ytimg.com/vi/VID123/mid.jpg")
        self.assertFalse(card["liveNow"])

    def test_vr_to_card_no_videoid(self):
        self.assertIsNone(youtube._vr_to_card({"title": {"simpleText": "x"}}))


class Browse(unittest.TestCase):
    def _payload(self):
        return {
            "contents": {"x": [
                {"videoRenderer": {
                    "videoId": "V1",
                    "title": {"simpleText": "Video 1"},
                    "thumbnail": {"thumbnails": []},
                }},
                {"continuationItemRenderer": {
                    "continuationEndpoint": {
                        "continuationCommand": {"token": "CONT123"}}}},
            ]}
        }

    def test_browse_feed_emit(self):
        with patch.dict(os.environ, {"WHISPER_YT_ACCESS_TOKEN": "AT"}, clear=False), \
             patch.object(youtube, "_get_innertube_key", return_value="KEY"), \
             patch.object(youtube, "_post_json",
                          return_value=(self._payload(), None)) as m:
            events = _capture_emit(youtube.browse, "FEsubscriptions")
        feed = [e for e in events if e["type"] == "feed"]
        self.assertEqual(len(feed), 1)
        self.assertEqual(feed[0]["videos"][0]["videoId"], "V1")
        self.assertEqual(feed[0]["continuation"], "CONT123")
        # İstek Bearer token ile yapılmış olmalı
        self.assertEqual(m.call_args[1].get("access_token") or
                         (m.call_args[0][2] if len(m.call_args[0]) > 2 else ""), "AT")
        # URL youtube.com origin'ine kilitli
        self.assertTrue(m.call_args[0][0].startswith("https://www.youtube.com/"))

    def test_browse_no_token_raises(self):
        env = {k: v for k, v in os.environ.items() if k != "WHISPER_YT_ACCESS_TOKEN"}
        with patch.dict(os.environ, env, clear=True):
            with self.assertRaises(RuntimeError):
                _capture_emit(youtube.browse, "FEsubscriptions")

    def test_browse_continuation_overrides_browse_id(self):
        with patch.dict(os.environ, {"WHISPER_YT_ACCESS_TOKEN": "AT"}, clear=False), \
             patch.object(youtube, "_get_innertube_key", return_value="KEY"), \
             patch.object(youtube, "_post_json",
                          return_value=(self._payload(), None)) as m:
            _capture_emit(youtube.browse, "FEsubscriptions", continuation="C9")
        payload = m.call_args[0][1]
        self.assertEqual(payload["continuation"], "C9")
        self.assertNotIn("browseId", payload)

    def test_browse_parses_lockup_view_model(self):
        """Yeni InnerTube kart formatı (kişisel akışlar bunu kullanır)."""
        payload = {"contents": {"x": [
            {"lockupViewModel": {
                "contentId": "LV1",
                "contentType": "LOCKUP_CONTENT_TYPE_VIDEO",
                "content": {"image": {"collectionThumbnailViewModel": {
                    "primaryThumbnail": {"thumbnailViewModel": {"image": {
                        "sources": [{"url": "https://i/96.jpg", "width": 96},
                                    {"url": "https://i/320.jpg", "width": 320}]}}}}}},
                "metadata": {"lockupMetadataViewModel": {
                    "title": {"content": "Kilit video"},
                    "metadata": {"contentMetadataViewModel": {
                        "metadataRows": [
                            {"metadataParts": [
                                {"text": {"content": "Kanal X"},
                                 "onTap": {"innertubeCommand": {"watchEndpoint": {"videoId": "LV1"}}}},
                                {"onTap": {"innertubeCommand": {"browseEndpoint": {"browseId": "UCchannel"}}}},
                            ]},
                            {"metadataParts": [
                                {"text": {"content": "12K views"}},
                                {"text": {"content": "3 days ago"}}]},
                        ]}}}},
                "rendererContext": {"commandContext": {"onTap": {
                    "innertubeCommand": {"watchEndpoint": {"videoId": "LV1"}}}}},
            }},
            {"lockupViewModel": {"contentType": "LOCKUP_CONTENT_TYPE_PODCAST"}},
            {"lockupViewModel": {}},  # id'siz — atlanmalı
        ]}}
        with patch.dict(os.environ, {"WHISPER_YT_ACCESS_TOKEN": "AT"}, clear=False), \
             patch.object(youtube, "_get_innertube_key", return_value="KEY"), \
             patch.object(youtube, "_post_json", return_value=(payload, None)):
            events = _capture_emit(youtube.browse, "FEwhat_to_watch")
        feed = [e for e in events if e["type"] == "feed"][0]
        vids = feed["videos"]
        self.assertEqual(len(vids), 1)
        self.assertEqual(vids[0]["videoId"], "LV1")
        self.assertEqual(vids[0]["title"], "Kilit video")
        self.assertEqual(vids[0]["author"], "Kanal X")
        self.assertEqual(vids[0]["viewCount"], 12000)
        self.assertEqual(vids[0]["authorId"], "UCchannel")
        self.assertEqual(vids[0]["publishedText"], "3 days ago")
        self.assertEqual(vids[0]["videoThumbnails"][0]["url"], "https://i/320.jpg")


class TestEndpointOverride(unittest.TestCase):
    """T4: WHISPER_YT_TEST_BASE yalnız loopback'e yönlendirme kabul eder."""

    def test_loopback_redirects(self):
        with patch.dict(os.environ,
                        {"WHISPER_YT_TEST_BASE": "http://127.0.0.1:8123"},
                        clear=False):
            self.assertEqual(youtube._endpoint(youtube.OAUTH_TOKEN),
                             "http://127.0.0.1:8123/token")
            self.assertEqual(youtube._endpoint(youtube.OAUTH_DEVICE),
                             "http://127.0.0.1:8123/device/code")
            self.assertEqual(youtube._endpoint(youtube.YTI_BROWSE),
                             "http://127.0.0.1:8123/youtubei/v1/browse")

    def test_remote_host_rejected(self):
        """Keyfi host'a OAuth/token trafiği yönlendirilemez (kimlik avı koruması)."""
        for bad in ("https://evil.example.com", "http://0.0.0.0:80",
                    "ftp://127.0.0.1", "http://127.0.0.1.evil.com"):
            with patch.dict(os.environ, {"WHISPER_YT_TEST_BASE": bad}, clear=False):
                self.assertEqual(youtube._endpoint(youtube.OAUTH_TOKEN),
                                 youtube.OAUTH_TOKEN, bad)

    def test_unset_keeps_prod(self):
        env = os.environ.copy()
        env.pop("WHISPER_YT_TEST_BASE", None)
        with patch.dict(os.environ, env, clear=True):
            self.assertEqual(youtube._endpoint(youtube.OAUTH_TOKEN),
                             youtube.OAUTH_TOKEN)


class MainDispatch(unittest.TestCase):
    def test_invalid_browse_id_rejected(self):
        argv = ["youtube.py", "browse", "--browse-id", "FEevil"]
        with patch.object(sys, "argv", argv), \
             patch.dict(os.environ, {"WHISPER_YT_ACCESS_TOKEN": "AT"}, clear=False):
            events = []
            with patch.object(youtube, "emit",
                              lambda t, **kw: events.append({"type": t, **kw})), \
                 self.assertRaises(SystemExit):
                youtube.main()
        self.assertEqual(events[-1]["type"], "error")
        self.assertIn("Desteklenmeyen", events[-1]["message"])

    def test_secrets_not_in_argv(self):
        """Gizli değerler yalnız env kanalından okunur — argparse'ta yok."""
        with open(youtube.__file__, encoding="utf-8") as f:
            src = f.read()
        for secret in ("client_secret", "access_token", "refresh_token", "device_code"):
            self.assertNotRegex(
                src, rf"add_argument\([^)]*--{secret.replace('_', '-')}")
            self.assertIn(f"WHISPER_YT_{secret.upper()}", src)


if __name__ == "__main__":
    unittest.main()
