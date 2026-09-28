"""Yazıcı hattı byte-exact golden kilidi.

Sabit segment listesi write_srt/write_vtt/write_txt/write_ass/write_dual_srt/
write_json'dan geçirilip `backend/golden-writers/` altındaki kayıtlı bayt
dizisiyle karşılaştırılır. BOM varlığı, zaman damgası formatı, satır sarma,
ASS kaçışları (word-joiner + fullwidth parantez), konuşmacı stil sırası ve
JSON şeması tek yerde kilitlenir.

Golden'lar bilinçli gözden geçirilerek üretildi (R208): beklenen davranışın
kendisidir. Bir düzeltme çıktıyı kasten değiştirirse fixture'ı yeniden üret:
    python backend/test_golden_writers.py --regen
"""

import json
import shutil
import sys
import tempfile
import types
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import transcribe as T  # noqa: E402

GOLDEN_DIR = Path(__file__).resolve().parent / 'golden-writers'

ENTRIES = [
    (0.0, 1.5, "Merhaba dünya."),
    (2.0, 4.25, "Bu, virgüllü ve ünlemli! Bir cümle; içinde ÇŞĞİÖÜ de var."),
    (5.0, 9.0, "Uzun satır örneği: kelime kelime kelime kelime kelime kelime kelime kelime kelime."),
    (10.0, 11.0, "C:\\Notlar\\altın.txt yolu ve {italik} kaçış testi."),
]
SPEAKERS = {0: "SPEAKER_00", 1: "SPEAKER_01", 2: "SPEAKER_00", 3: "SPEAKER_01"}
DUAL_TRANSLATED = [(s, e, t.upper()) for s, e, t in ENTRIES]


def _write_all(target_dir: Path) -> dict:
    target_dir.mkdir(parents=True, exist_ok=True)
    T.write_srt(ENTRIES, target_dir / 'basic.srt')
    T.write_vtt(ENTRIES, target_dir / 'basic.vtt')
    T.write_txt(ENTRIES, target_dir / 'basic.txt')
    T.write_ass(ENTRIES, target_dir / 'basic.ass', speakers=SPEAKERS)
    T.write_dual_srt(ENTRIES, DUAL_TRANSLATED, target_dir / 'dual.srt')
    # write_json dil/durak bilgisini ÖZNITELIK üzerinden okur (getattr) — düz
    # dict vermek language=null üretir; gerçek transkripsiyon nesne gönderir.
    info = types.SimpleNamespace(language='tr', language_probability=0.98, duration=11.0)
    T.write_json(ENTRIES, target_dir / 'basic.json', info=info)
    return {p.name: p.read_bytes() for p in sorted(target_dir.iterdir())}


class TestGoldenWriters(unittest.TestCase):
    def test_outputs_match_golden(self):
        golden_files = {p.name for p in GOLDEN_DIR.iterdir()}
        self.assertEqual(
            golden_files,
            {'basic.srt', 'basic.vtt', 'basic.txt', 'basic.ass', 'dual.srt', 'basic.json'},
            'golden dosya kümesi değişti — testin yazar listesiyle uyumlu tut')
        with tempfile.TemporaryDirectory() as td:
            produced = _write_all(Path(td))
            for name, actual in produced.items():
                # Fixture'lar .gitattributes ile LF'e sabitli; metin-yazımı
                # Windows'ta CRLF'e çevrilir — satır sonunu normalize et ki
                # bayt kilidi checkout ayarından bağımsız kalsın.
                expected = (GOLDEN_DIR / name).read_bytes().replace(b'\r\n', b'\n')
                self.assertEqual(
                    expected, actual.replace(b'\r\n', b'\n'),
                    f'{name} golden ile ayrıştı. Kasıtlı değişiklikse '
                    '`--regen` ile fixture yenile.')

    def test_bom_contract(self):
        # SRT/ASS/dual: BOM (Windows oynatıcılar); VTT/TXT/JSON: BOM'suz
        with tempfile.TemporaryDirectory() as td:
            produced = _write_all(Path(td))
            bom = b'\xef\xbb\xbf'
            for name in ('basic.srt', 'basic.ass', 'dual.srt'):
                self.assertTrue(produced[name].startswith(bom), f'{name} BOM eksik')
            for name in ('basic.vtt', 'basic.txt', 'basic.json'):
                self.assertFalse(produced[name].startswith(bom), f'{name} BOM olmamalı')

    def test_json_is_parseable_and_stable(self):
        payload = json.loads((GOLDEN_DIR / 'basic.json').read_text(encoding='utf-8'))
        self.assertEqual(payload['version'], 1)
        self.assertEqual(len(payload['segments']), len(ENTRIES))
        self.assertEqual(payload['segments'][0]['text'], ENTRIES[0][2])
        self.assertEqual(payload['segments'][0]['start'], 0.0)

    def test_golden_ass_invariants(self):
        text = (GOLDEN_DIR / 'basic.ass').read_text(encoding='utf-8-sig')
        self.assertIn('Style: Speaker0', text)
        self.assertIn('Style: Speaker1', text)
        # Literal backslash-N kaçışı word-joiner ile ayrıldı, { } fullwidth oldu
        self.assertIn('\\⁠Notlar', text)
        self.assertIn('｛italik｝', text)
        self.assertNotIn('{italik}', text.split('Format: Layer')[1])

    def test_writers_are_atomic(self):
        # atomic_text_writer tmp+rename yapar — golden'lar final içerikle eşit olmalı
        with tempfile.TemporaryDirectory() as td:
            produced = _write_all(Path(td))
            leftover_tmp = [p.name for p in Path(td).iterdir() if '.tmp' in p.name or p.suffix == '.part']
            self.assertEqual(leftover_tmp, [])

    def test_failed_write_preserves_existing_target(self):
        # Doğrulama hatası (sonlu olmayan zaman damgası) dosya açılmadan önce
        # fırlatılır — mevcut çıktı ve dizin temiz kalmalı.
        bad = [(0.0, float('inf'), 'bozuk')]
        with tempfile.TemporaryDirectory() as td:
            target = Path(td) / 'out.srt'
            target.write_bytes(b'mevcut icerik')
            with self.assertRaises((ValueError, TypeError)):
                T.write_srt(bad, target)
            self.assertEqual(target.read_bytes(), b'mevcut icerik')
            leftover = [p.name for p in Path(td).iterdir() if p.name != 'out.srt']
            self.assertEqual(leftover, [], 'hata yolu geçici dosya bırakmamalı')
            new_target = Path(td) / 'yeni.json'
            with self.assertRaises((ValueError, TypeError)):
                T.write_json(bad, new_target)
            self.assertFalse(new_target.exists())


if __name__ == '__main__':
    if '--regen' in sys.argv:
        _write_all(GOLDEN_DIR)
        print(f'golden fixture yenilendi: {sorted(p.name for p in GOLDEN_DIR.iterdir())}')
        sys.exit(0)
    unittest.main()
