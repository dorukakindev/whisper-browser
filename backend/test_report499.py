"""Actual shared byte decoder regressions; no TTS model or GPU needed."""
import os
from pathlib import Path
import importlib.util
import unittest

root = Path(os.environ.get('REPORT499_BASE', Path(__file__).resolve().parent.parent))
spec = importlib.util.spec_from_file_location('subtitle_text499', root / 'backend/subtitle_text.py')
decoder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(decoder)
TEXT = '1\n00:00:01,000 --> 00:00:03,000\nÇağrı ışığı gördü.\n'

class DecoderRegressions(unittest.TestCase):
    def test_499_13_utf32_signature_before_utf16(self):
        for encoding, bom in [('utf-32-le', b'\xff\xfe\0\0'), ('utf-32-be', b'\0\0\xfe\xff')]:
            self.assertEqual(decoder.decode_subtitle_bytes(bom + TEXT.encode(encoding))[0], TEXT)

    def test_499_14_bomless_utf16_subtitles(self):
        for encoding in ['utf-16-le', 'utf-16-be']:
            self.assertEqual(decoder.decode_subtitle_bytes(TEXT.encode(encoding))[0], TEXT)

    def test_499_15_truncated_explicit_unicode_is_not_legacy_text(self):
        with self.assertRaises(UnicodeDecodeError):
            decoder.decode_subtitle_bytes(TEXT.encode('utf-16')[:-1])
        with self.assertRaises(UnicodeDecodeError):
            decoder.decode_subtitle_bytes(b'\xef\xbb\xbf\xc3')
        for encoding in ['utf-8-sig', 'cp1254']:
            self.assertEqual(decoder.decode_subtitle_bytes(TEXT.encode(encoding))[0], TEXT)

if __name__ == '__main__':
    unittest.main()
