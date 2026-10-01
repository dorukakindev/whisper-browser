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

# Seçenekleri gerçekten çalıştıran ek fixture'lar (ENTRIES'e dokunulmadı —
# paylaşılan tabloların özeti sabit kalsın):
#  * 80 sütunda 3 satır gerektiren tek cümle — max_lines=3, =2'den farklı çıktı
#    vermezse seçenek etkisiz demektir.
LONG_ENTRY = (12.0, 16.0, 'Uzun cümle ' + ' '.join('kelime%d' % i for i in range(30)) + ' bitti.')
#  * sıra sayısı: '2.' tr'de kısaltma (kırılmaz), en'de cümle sonu (kırılır) —
#    language parametresi wrap kararını değiştirmezse regresyon yakalanamazdı.
ORDINAL_ENTRY = (0.0, 1.5, '2. Dünya savaşı başladı.')


def _payload_bytes(path):
    # İşletim-sistemi ayrımı: yazıcılar metin modunda açılır, Windows'ta \n
    # CRLF'e çevrilir — içerik sözleşmesi aynıdır, yalnız satır sonu taşıyıcısı
    # farklıdır. Özet satır sonu ve BOM'dan arındırılmış UTF-8 üzerinden alınır.
    text = path.read_bytes().decode('utf-8-sig')
    return text.replace('\r\n', '\n').replace('\r', '\n').encode('utf-8')


def _digest(write_fn, suffix='.txt'):
    with tempfile.TemporaryDirectory() as td:
        path = Path(td) / ('out' + suffix)
        ret = write_fn(path)
        if isinstance(ret, str):
            return ret  # yardımcı kendi özetini verdi (ör. confidence üçlüsü)
        return hashlib.sha256(_payload_bytes(path)).hexdigest()


def _conf_digest(path, threshold=0.6):
    # Dönen (yazıldı, sayı, sık_kelime) üçlüsü de kilidin parçası; yazılmazsa
    # payload boş kalır (threshold'un üstünde düşük-güven kelime yoksa dosya yok).
    wrote, count, frequent = T.write_confidence_report(path, ENTRIES, WORDS, threshold)
    payload = _payload_bytes(path) if wrote else b''
    return hashlib.sha256(
        payload + json.dumps([wrote, count, frequent], sort_keys=True).encode('utf-8')
    ).hexdigest()


CASES = {
    'srt:wrap-none': lambda p: T.write_srt(ENTRIES, p, wrap_mode='none'),
    'srt:wrap-balanced-30': lambda p: T.write_srt(ENTRIES, p, wrap_mode='balanced', max_line_width=30),
    'srt:wrap-balanced-80x3': lambda p: T.write_srt(
        ENTRIES, p, wrap_mode='balanced', max_line_width=80, max_lines=3),
    # max_lines=3, =2 ile aynı özeti üretirse seçenek devre dışı demektir.
    'srt:balanced-80x3-long': lambda p: T.write_srt(
        [LONG_ENTRY], p, wrap_mode='balanced', max_line_width=80, max_lines=3),
    'srt:balanced-80x2-long': lambda p: T.write_srt(
        [LONG_ENTRY], p, wrap_mode='balanced', max_line_width=80, max_lines=2),
    'srt:sentence-maxlines-1': lambda p: T.write_srt(ENTRIES, p, wrap_mode='sentence', max_lines=1),
    'srt:lang-en': lambda p: T.write_srt(ENTRIES, p, language='en'),
    # ordinal: tr '2.'yi kısaltma sayıp kırmaz, en cümle sonu sayıp kırar —
    # iki özet birbirinden farklı olmalı (aşağıdaki çift testi de kilitler).
    'srt:lang-en-ordinal': lambda p: T.write_srt([ORDINAL_ENTRY], p, language='en'),
    'srt:lang-tr-ordinal': lambda p: T.write_srt([ORDINAL_ENTRY], p, language='tr'),
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
    'ass:no-speakers': 'd28a0afc423fb3d1b31311ebabb6348f6c20c5bfe55ad2e88a795b6ef913d9fb',
    'ass:speakers-balanced': '3bf8dc95cb15d6f7e59cd4c1d74e96997780e4490dc901afbfdeeb43e5b806a9',
    'confidence:0.3': '7ff491023546ea67336f01123d2bc3667e74d62d7abfa916bb1b62563f94496b',
    'confidence:0.6': 'a2839584832f4339c1baaa6b2ddd2ecd82843344d91a8c900850c07f53122721',
    'dual:source-first': 'b3f3cbf6fbc9e75f3faf4d8d16eed301a8c277c96a483a3f8ee7ad8f1bee2e1b',
    'srt:balanced-80x2-long': '2de8cab102d4b2d219099597352013f6ff8be6b48e8ce006cee3b6fba630489f',
    'srt:balanced-80x3-long': '9cfc0d7ce0a2021d31a0df6731564de3912eb735c3bfcf11a25d94ea3f387771',
    'srt:lang-en-ordinal': '71627b66233933fa6005cf68ef85dfd5b8e78fd2db7722673f7a84ae459178f8',
    'srt:lang-tr-ordinal': '6984e17cb80e8480d6717767523ea2c745c0f3c81c87a6aee3fa95671618e417',
    'json:no-info': 'f865ed6ff60ebaa5129e4440ffeaf145bf47bba01bd49f4e7443b6089022030b',
    'json:words+speakers': 'bccfc9a23f45c2e9aa2b77751c0afd7686c8bb91c0f5c3291a3008a9143e07db',
    'srt:lang-en': '35cd90144b57f92d6e294736e72b9d042e81b414860ced5bef2946dc6aa99fe1',
    'srt:sentence-maxlines-1': '7e49ee03d0c7ea75369fa3b004ea88f85accf1c89459cd73104f73e4a25cdfcb',
    'srt:wrap-balanced-30': 'eb6a5aa6e3c73ebe41690e387ac4072da78571d84b5cd6bfbc50ca411ce68392',
    'srt:wrap-balanced-80x3': 'd94c08add96ce294b52ddf1bb1919df2a378353d2866a3bfc70bee056bae2ef6',
    'srt:wrap-none': '7e49ee03d0c7ea75369fa3b004ea88f85accf1c89459cd73104f73e4a25cdfcb',
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

    def test_option_pairs_actually_differ(self):
        # Golden kilit çıktıyı dondurur ama etkisiz seçeneği de dondurabilir.
        # Çift testler seçeneğin ÇALIŞTIĞINI ayrıca kilitler.
        self.assertNotEqual(_digest(CASES['srt:balanced-80x3-long']),
                            _digest(CASES['srt:balanced-80x2-long']),
                            'max_lines=3 seçeneği çıktıyı değiştirmiyor')
        self.assertNotEqual(_digest(CASES['srt:lang-en-ordinal']),
                            _digest(CASES['srt:lang-tr-ordinal']),
                            'language seçeneği ordinal davranışını değiştirmiyor')


def _regen():
    for name in sorted(CASES):
        print(f"    '{name}': '{_digest(CASES[name])}',")


if __name__ == '__main__':
    if '--regen' in sys.argv:
        _regen()
    else:
        unittest.main()
