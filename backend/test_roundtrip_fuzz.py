"""R323-1 — SRT/VTT/ASS yazıcı→ayrıştırıcı mega-fuzz (~100k cue).

R137 parser'a rastgele bozuk girdi veriyor; R209 sabit fixture'ı roundtrip
ediyor. Bu dosya ortadaki boşluğu kapatır: rastgele üretilmiş hostile içerikli
cue setlerini GERÇEK yazıcıdan geçirip GERÇEK okuyucuya (read_subtitle_text +
parse_subtitle_entries) geri okutur. İnvariantlar:

- cue sayısı korunur (satır bölme/kaçış yazıcısı bozulursa sayı düşer)
- zamanlar biçim çözünürlüğünde geri gelir (SRT/VTT ms, ASS santisaniye)
- metin, dokümante kaçış dönüşümleri uygulandıktan sonra eşit kalır
"""

import html
import random
import re
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import transcribe as T  # noqa: E402

WJ = "⁠"  # writer'ın \N \n \h bölmek için kullandığı word-joiner

# Hostile ama yasal diyalog parçaları — virgül (ASS alan ayracı), süslü
# parantez, \N/\h benzeri diziler, HTML-benzeri etiketler, unicode, kontrol.
TEXT_POOL = [
    "Merhaba dünya",
    "birinci, ikinci, üçüncü — virgüllü",  # ASS'te virgül Text alanında güvenli
    "{gibi görünen} süslü parantezler",
    r"C:\Notlar\altın.txt\yeni",           # \N benzeri kaçış dizileri
    r"yol\Nimsi\h değer\n satırı",
    "SATIR1\nSATIR2 içinde gerçek newline",
    "çğıİşöü ĞŞ — Türkçe",
    "と한국어と",
    "emoji 🎬🔥 satırı",
    "5 < 10 ve 20 > 15 gerçek diyalog",
    "&amp; &lt; &gt; &quot; entity'leri",
    "'tek' \"çift\" tırnaklar",
    "    kenar    boşlukları    ",
    "a\tb\ttab'lı",
    "___alt çizgi___ *yıldız* ~tilda~",
    "RTL: متن فارسی ← يمين",
    "çok" + "u" * 200 + "zun satır",
    "küçük harfli {\\an8} biçimlendirme parçası",  # parse_ass bunu ayıklar
]

TIME_EDGES = [0.0, 0.001, 0.499, 0.5, 0.999, 1.0, 59.999, 60.0, 3599.99, 3600.0]


def gen_entries(rng, count):
    entries = []
    cursor = 0.0
    for _ in range(count):
        if rng.random() < 0.15:
            start = rng.choice(TIME_EDGES) + cursor
        else:
            start = cursor + rng.random() * 4
        dur = rng.choice([0.08, 0.1, 0.5, 1.0, 2.5, 8.0]) + rng.random()
        end = start + dur
        text = rng.choice(TEXT_POOL)
        if rng.random() < 0.2:
            text = text + " " + rng.choice(TEXT_POOL)
        entries.append((round(start, 3), round(end, 3), text))
        cursor = end + rng.random() * 0.5  # örtüşmesiz tut → sayı korunur
    return entries


def ass_expect(text):
    """write_ass'in metne uyguladığı belgelenmiş kaçışları beklenene uygula."""
    expected = re.sub(r"\\(?=[NnhH])", lambda _m: "\\" + WJ, text)
    expected = expected.replace("{", "｛").replace("}", "｝")
    expected = expected.replace("\n", " ")
    return " ".join(expected.split())


def norm(text):
    return " ".join(str(text).replace(" ", " ").split())


def read_back(path, suffix):
    text, _enc, _repaired = T.read_subtitle_text(Path(path))
    return T.parse_subtitle_entries(text, suffix=suffix)


class RoundtripFuzzTests(unittest.TestCase):
    ROUND_TARGET = 100_000

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self.tmp.name)
        self.rng = random.Random(20260930)
        self.checks = 0
        self.total_cues = 0

    def tearDown(self):
        self.tmp.cleanup()

    def run_round(self, fmt, wrap_mode):
        count = self.rng.randint(20, 140)
        entries = gen_entries(self.rng, count)
        path = self.dir / f"case-{self.total_cues}.{fmt}"
        if fmt == "srt":
            T.write_srt(entries, path, wrap_mode=wrap_mode)
        elif fmt == "vtt":
            T.write_vtt(entries, path, wrap_mode=wrap_mode)
        else:
            T.write_ass(entries, path, wrap_mode=wrap_mode)
        got = read_back(path, fmt)
        tolerance = 0.012 if fmt == "ass" else 0.002
        self.assertEqual(
            len(got), len(entries),
            f"{fmt}/{wrap_mode}: cue sayısı {len(got)} != {len(entries)}")
        for i, ((s, e, text), (gs, ge, gtext)) in enumerate(zip(entries, got)):
            self.assertAlmostEqual(gs, s, delta=tolerance,
                                   msg=f"{fmt} cue {i}: start {gs} != {s}")
            self.assertAlmostEqual(ge, e, delta=tolerance,
                                   msg=f"{fmt} cue {i}: end {ge} != {e}")
            if fmt == "ass":
                # {…} override blokları parser tarafından ayıklanır; bekleneni
                # aynı süzgeçten geçir.
                exp = re.sub(r"\{[^}]*\}", "", ass_expect(text)).strip()
            elif fmt == "vtt":
                # VTT metni entity taşır: yazıcı bilinen entity'leri geçirir
                # (bare-& kaçırır), okuyucu tek kez çözer — entity-benzeri
                # kaynak metin "&amp;" → "&" olarak geri gelir (yazıcı çıplak
                # & ile entity'yi ayırt edemez; dokümante sözleşme).
                exp = norm(html.unescape(text).replace("\n", " "))
            else:
                exp = norm(text.replace("\n", " "))
            self.assertEqual(norm(gtext), norm(exp),
                             f"{fmt} cue {i}: metin '{norm(gtext)!r}' != '{norm(exp)!r}'")
            self.checks += 1
        self.total_cues += len(entries)

    def test_mega_roundtrip(self):
        rounds = 0
        while self.total_cues < self.ROUND_TARGET:
            self.run_round(self.rng.choice(["srt", "vtt", "ass"]),
                           self.rng.choice(["none", "sentence"]))
            rounds += 1
        print(f"roundtrip-fuzz: {self.checks} cue {rounds} dosyada GEÇTİ")


if __name__ == "__main__":
    unittest.main()
