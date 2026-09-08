import unittest

from io_errors import classify_ffmpeg_error, classify_ytdlp_error, ffmpeg_version_supported


class ExternalErrorClassificationTests(unittest.TestCase):
    def test_ffmpeg_version_must_be_recognizable_and_supported(self):
        self.assertTrue(ffmpeg_version_supported("ffmpeg version 9.0.1 build"))
        self.assertFalse(ffmpeg_version_supported("ffmpeg version 3.4 old"))
        self.assertFalse(ffmpeg_version_supported("not actually ffmpeg"))

    def test_ffmpeg_error_classes_are_turkish_and_do_not_echo_raw_path(self):
        fixtures = [
            ("No space left on device C:/secret/video.mp4", "boş alan"),
            ("Permission denied C:/secret/video.mp4", "kilitli"),
            ("moov atom not found C:/secret/video.mp4", "bozuk"),
            ("Error opening input file C:/secret/video.mp4", "açılamadı"),
            ("Stream map 0:a:9 matches no streams", "ses akışı"),
            ("No such filter: subtitles", "filtre"),
        ]
        for raw, phrase in fixtures:
            with self.subTest(raw=raw):
                result = classify_ffmpeg_error(raw, "Ses çıkarma", 1)
                self.assertIn(phrase, result)
                self.assertNotIn("C:/secret", result)

    def test_ytdlp_403_and_429_are_distinct(self):
        self.assertIn("HTTP 403", classify_ytdlp_error(Exception("HTTP Error 403: Forbidden https://signed")))
        self.assertIn("HTTP 429", classify_ytdlp_error(Exception("HTTP Error 429: Too Many Requests")))

    def test_ytdlp_bot_cookie_format_network_and_disk_classes(self):
        fixtures = [
            ("Sign in to confirm you’re not a bot", "oturum doğrulaması"),
            ("Could not copy Chrome cookie database", "cookie veritabanı"),
            ("Requested format is not available", "biçimi"),
            ("Unsupported URL", "desteklenmiyor"),
            ("Unable to download webpage", "bağlanılamadı"),
            ("No space left on device", "boş alan"),
            ("Permission denied", "kilitli"),
        ]
        for raw, phrase in fixtures:
            with self.subTest(raw=raw):
                self.assertIn(phrase, classify_ytdlp_error(Exception(raw)))

    def test_unknown_ytdlp_error_does_not_echo_signed_url(self):
        result = classify_ytdlp_error(Exception("unknown https://example.test/?token=SECRET"))
        self.assertNotIn("SECRET", result)
        self.assertIn("tamamlanamadı", result)


if __name__ == "__main__":
    unittest.main(verbosity=2)
