"""Yazıcı seçenek matrisi — sha256-locked permütasyon golden'ı.

`test_golden_writers.py` varsayılan seçeneklerle byte-exact dosya kilitler;
bu dosya aynı fixture'ı seçenek permütasyonlarıyla geçirir: wrap_mode üçlüsü,
max_line_width/max_lines sınırları, dual sırası, speakers'lı/words'lü varyantlar
ve confidence raporu. Çıktılar dosyaya kaydedilmez — her varyantın sha256
özeti `EXPECTED` tablosuna kilitlenir (dosya artışını önler).

Bir düzeltme çıktıyı kasten değiştirirse tabloyu yeniden üret:
    python backend/test_golden_matrix.py --regen
"""

import hashlib
import io
import json
import sys
import tempfile
import types
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import transcribe as T  # noqa: E402

from test_golden_writers import ENTRIES, SPEAKERS, DUAL_TRANSLATED  # noqa: E402

# Kelime sözlükleri json/confidence yazıcılarının all_words kanalı içindir.
WORDS = [
    {"start": 0.0, "end": 0.4, "word": "Merhaba", "probability": 0.91},
    {"start": 0.45, "end": 0.9, "word": "dünya.", "probability": 0.42},
    {"start": 2.0, "end": 2.3, "word": "Bu,", "probability": 0.99},
    {"start": 2.3, "end": 2.8, "word": "virgüllü", "probability": 0.55},
    {"start": 2.85, "end": 3.4, "word": "ve", "probability": 0.97},
    {"start": 3.4, "end": 4.25, "word": "ünlemli!", "probability": 0.35},
    {"start": 10.0, "end": 10.6, "word": "C:\\Notlar\\altın.txt", "probability": 0.88},
    {"start": 10.6, "end": 11.0, "word": "yolu", "probability": 0.7},
]

INFO = types.SimpleNamespace(language='tr', language_probability=0.98, duration=11.0)


def _digest(write_fn, suffix='.txt'):
    with tempfile.TemporaryDirectory() as td:
        path = Path(td) / ('out' + suffix)
        ret = write_fn(path)
        if isinstance(ret, str):
            return ret  # yardımcı kendi özetini verdi (ör. confidence üçlüsü)
        return hashlib.sha256(path.read_bytes()).hexdigest()


def _conf_digest(path, threshold=0.6):
    # Dönen (yazıldı, sayı, sık_kelime) üçlüsü de kilidin parçası; yazılmazsa
    # payload boş kalır (threshold'un üstünde düşük-güven kelime yoksa dosya yok).
    wrote, count, frequent = T.write_confidence_report(path, ENTRIES, WORDS, threshold)
    payload = path.read_bytes() if wrote else b''
    return hashlib.sha256(
        payload + json.dumps([wrote, count, frequent], sort_keys=True).encode('utf-8')
    ).hexdigest()


CASES = {
    'srt:wrap-none': lambda p: T.write_srt(ENTRIES, p, wrap_mode='none'),
    'srt:wrap-balanced-30': lambda p: T.write_srt(ENTRIES, p, wrap_mode='balanced', max_line_width=30),
    'srt:wrap-balanced-80x3': lambda p: T.write_srt(
        ENTRIES, p, wrap_mode='balanced', max_line_width=80, max_lines=3),
    'srt:sentence-maxlines-1': lambda p: T.write_srt(ENTRIES, p, wrap_mode='sentence', max_lines=1),
    'srt:lang-en': lambda p: T.write_srt(ENTRIES, p, language='en'),
    'vtt:wrap-none': lambda p: T.write_vtt(ENTRIES, p, wrap_mode='none'),
    'vtt:balanced-30': lambda p: T.write_vtt(ENTRIES, p, wrap_mode='balanced', max_line_width=30),
    'vtt:lang-en': lambda p: T.write_vtt(ENTRIES, p, language='en'),
    'ass:no-speakers': lambda p: T.write_ass(ENTRIES, p),
    'ass:speakers-balanced': lambda p: T.write_ass(
        ENTRIES, p, speakers=SPEAKERS, wrap_mode='balanced'),
    'dual:source-first': lambda p: T.write_dual_srt(ENTRIES, DUAL_TRANSLATED, p, translation_first=False),
    'json:words+speakers': lambda p: T.write_json(
        ENTRIES, p, info=INFO, speakers=SPEAKERS, all_words=WORDS),
    'json:no-info': lambda p: T.write_json(ENTRIES, p),
    'confidence:0.6': lambda p: _conf_digest(p, 0.6),
    'confidence:0.3': lambda p: _conf_digest(p, 0.3),
}

# --regen ile üretilen sabit tablo; isimler CASES anahtarlarıyla birebir.
EXPECTED = {
    'ass:no-speakers': 'a7a886da54cc08780db8d9627174fc14e8f7465ad75dee9e3f9080ca0700a68f',
    'ass:speakers-balanced': 'ef948e166bcf5001591b350b4f6bedaecee56403bfdcd2d32246c63969aa14a2',
    'confidence:0.3': '7ff491023546ea67336f01123d2bc3667e74d62d7abfa916bb1b62563f94496b',
    'confidence:0.6': '1079423e87682357270eaff4aef7b99b88ad57d83f5356ad504af39d87238d7f',
    'dual:source-first': '821fde8aa5f04f0a6dcaa2fa225e9c8819819db8ad40681405c301747868ef3e',
    'json:no-info': 'f865ed6ff60ebaa5129e4440ffeaf145bf47bba01bd49f4e7443b6089022030b',
    'json:words+speakers': 'bccfc9a23f45c2e9aa2b77751c0afd7686c8bb91c0f5c3291a3008a9143e07db',
    'srt:lang-en': '52ece43180eaf075ac2707a51271165c1c2e4f38aea52ce58300fe65456ec19d',
    'srt:sentence-maxlines-1': '339ffc6d3cc9ad14a35b879cdd8728948e872fc7347414495f36da318a5b296f',
    'srt:wrap-balanced-30': '2a51756a86232c8c322b982a6165c1a2a80e1300654f43c616bbdd827eae025c',
    'srt:wrap-balanced-80x3': 'b21e1dbc475e285ce8ae80f1e9e5757e88a0a9142819cde5c8d90c6a93ed2159',
    'srt:wrap-none': '339ffc6d3cc9ad14a35b879cdd8728948e872fc7347414495f36da318a5b296f',
    'vtt:balanced-30': '99f3bc66f4ecc1d769d2ce02dfd2b3b0a94ae9487416f77b1ecc33966953da57',
    'vtt:lang-en': 'e027a048cca897fb01e6cd99447e4fc879c6c5ca2753a623c7970b461a892224',
    'vtt:wrap-none': '02abbe38e1d358daac4c5710ba2c07d1339361c06925082f0b7f00c536752ad0',
}


class TestGoldenMatrix(unittest.TestCase):
    def test_all_cases_locked(self):
        missing = sorted(set(CASES) - set(EXPECTED))
        self.assertFalse(missing, f'EXPECTED tablosunda eksik: {missing}')
        for name, fn in CASES.items():
            with self.subTest(case=name):
                self.assertEqual(_digest(fn), EXPECTED[name],
                                 f'{name} çıktı özeti değişti — kasten ise --regen')

    def test_expected_covers_no_extra(self):
        extra = sorted(set(EXPECTED) - set(CASES))
        self.assertFalse(extra, f'EXPECTED bayat anahtar içeriyor: {extra}')


def _regen():
    for name in sorted(CASES):
        print(f"    '{name}': '{_digest(CASES[name])}',")


if __name__ == '__main__':
    if '--regen' in sys.argv:
        _regen()
    else:
        unittest.main()
