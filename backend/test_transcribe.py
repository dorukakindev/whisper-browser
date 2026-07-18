"""
transcribe.py saf-fonksiyon testleri.

Ağır bağımlılık YOK: modül seviyesinde torch/faster-whisper import'u try/except ile
sarılı olduğu için `import transcribe` GPU/venv olmadan da çalışır.

Çalıştırma:
    python backend/test_transcribe.py       # dahili runner (pytest gerekmez)
    python -m pytest backend/test_transcribe.py   # pytest varsa
"""

import os
import sys
import tempfile
import types

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import transcribe as T  # noqa: E402


# ---- faster-whisper segment/word arayüzünü taklit eden hafif sahte sınıflar ----
class W:
    def __init__(self, word, start, end, probability=1.0):
        self.word = word
        self.start = start
        self.end = end
        self.probability = probability


class Seg:
    def __init__(self, start, end, text, words=None):
        self.start = start
        self.end = end
        self.text = text
        self.words = words


# ===== parse_timecode =====
def test_parse_timecode():
    assert T.parse_timecode("90") == 90
    assert T.parse_timecode("1:30") == 90
    assert T.parse_timecode("01:02:03") == 3723
    assert T.parse_timecode("1:30.5") == 90.5
    assert T.parse_timecode("") is None
    assert T.parse_timecode(None) is None
    for bad in ("abc", "1:2:3:4", "-5"):
        try:
            T.parse_timecode(bad)
            assert False, f"beklenen hata yok: {bad}"
        except RuntimeError:
            pass


# ===== zaman biçimleme =====
def test_time_formatters():
    assert T.format_srt_time(3661.5) == "01:01:01,500"
    assert T.format_vtt_time(3661.5) == "01:01:01.500"
    assert T.format_srt_time(-1) == "00:00:00,000"
    # yuvarlama taşması saniyeye/dakikaya doğru düzgün taşmalı
    assert T.format_srt_time(59.9996) == "00:01:00,000"


# ===== noktalama tespiti =====
def test_has_enough_punctuation():
    assert T.has_enough_punctuation("Merhaba. Nasılsın? İyiyim. Sen? Ben de. Güzel.") is True
    assert T.has_enough_punctuation("bir iki üç dört beş altı yedi sekiz") is False
    assert T.has_enough_punctuation("kısa metin") is True  # <6 kelime → kontrol yok


# ===== tekrar döngüsü =====
def test_repetition():
    assert T.has_repetition_loop("evet evet evet evet") is True
    assert T.has_repetition_loop("bugün hava çok güzel") is False
    assert T.collapse_repetition("evet evet evet evet") == "evet evet"


# ===== halüsinasyon =====
def test_is_hallucination():
    assert T.is_hallucination("") is True
    assert T.is_hallucination("[Müzik]") is True
    assert T.is_hallucination("Abone olmayı unutmayın") is True
    assert T.is_hallucination("Subtitles by someone") is True
    assert T.is_hallucination("Merhaba dünya, bugün güzel bir gün.") is False


# ===== metin temizleme =====
def test_clean_text():
    assert T.clean_text("Merhaba , dünya .") == "Merhaba, dünya."
    assert T.clean_text("<i>Merhaba</i>  dünya") == "Merhaba dünya"
    assert T.clean_text("Bir...") == "Bir…"
    assert T.strip_html("a &amp; b") == "a & b"


# ===== kısa parça birleştirme =====
def test_merge_short_entries():
    entries = [(0.0, 0.4, "Ah"), (0.5, 2.5, "bir şey")]
    merged = T.merge_short_entries(entries)
    assert len(merged) == 1
    assert merged[0][2] == "Ah bir şey"
    assert merged[0][0] == 0.0 and merged[0][1] == 2.5


# ===== ardışık tekrar temizleme =====
def test_dedupe_consecutive():
    entries = [(0.0, 1.0, "Hayır."), (1.1, 2.0, "Hayır.")]
    out = T.dedupe_consecutive(entries)
    assert len(out) == 1
    # uzaktaki gerçek tekrar korunmalı (gap > max_gap)
    far = [(0.0, 1.0, "Hayır."), (10.0, 11.0, "Hayır.")]
    assert len(T.dedupe_consecutive(far)) == 2


# ===== zamanlama normalizasyonu =====
def test_normalize_timings():
    # çakışma: 0-5 ve 4-8 → ilkinin bitişi ikincinin başına taşmamalı
    out = T.normalize_timings([(0.0, 5.0, "a"), (4.0, 8.0, "b")], min_gap=0.08)
    assert out[0][1] <= out[1][0], "çakışma giderilmedi"
    # çok kısa süre uzatılmalı (yer varsa)
    out2 = T.normalize_timings([(0.0, 0.1, "biraz uzunca metin")], min_dur=0.8)
    assert out2[0][1] - out2[0][0] >= 0.7


# ===== kalite raporu =====
def test_compute_quality_report():
    entries = [
        (0.0, 1.0, "a" * 30),       # 30 KPS → hızlı okuma
        (2.0, 12.0, "uzun blok"),   # 10 sn → çok uzun
    ]
    r = T.compute_quality_report(entries, max_cps=20.0, max_dur=7.0, min_dur=0.8)
    assert r["blocks"] == 2
    assert r["cps_violations"] >= 1
    assert r["too_long"] >= 1
    assert r["longest_dur"] == 10.0
    assert r["max_cps"] >= 30.0
    # konuşmacı etiketi KPS dışı sayılmalı
    r2 = T.compute_quality_report([(0.0, 5.0, "[SPEAKER_00] kısa")], max_cps=20.0)
    assert r2["cps_violations"] == 0
    assert T.compute_quality_report([])["blocks"] == 0


# ===== cümle bazlı bölme =====
def test_split_segment_sentence():
    words = [
        W(" Merhaba", 0.0, 0.5),
        W(" dünya.", 0.5, 1.0),
        W(" Nasılsın?", 1.2, 1.8),
    ]
    seg = Seg(0.0, 1.8, "Merhaba dünya. Nasılsın?", words)
    chunks = T.split_segment_sentence(seg)
    assert len(chunks) == 2
    assert chunks[0][2] == "Merhaba dünya."
    assert chunks[1][2] == "Nasılsın?"

    # yanlış nokta koruması: küçük harf/bağlaç sonrası bölünmemeli
    words2 = [
        W(" düşünüyordum.", 0.0, 0.5),
        W(" and", 0.55, 0.7),
        W(" izliyordum.", 0.7, 1.2),
    ]
    seg2 = Seg(0.0, 1.2, "düşünüyordum. and izliyordum.", words2)
    chunks2 = T.split_segment_sentence(seg2)
    assert len(chunks2) == 1, "bağlaç öncesi yanlış nokta bölmesi engellenmedi"


# ===== checkpoint / kaldığı yerden devam =====
def test_checkpoint_path():
    assert T._checkpoint_path("D:/film.mkv") == "D:/film.mkv.whisper.ckpt.json"


def test_job_signature():
    args = types.SimpleNamespace(
        model="large-v3", engine="faster", language="tr", task="transcribe",
        split_mode="sentence", audio_track=-1, hard_max_chars=220,
    )
    sig = T.job_signature(args)
    assert sig["model"] == "large-v3" and sig["audio_track"] == -1
    # JSON round-trip sonrası eşitlik korunmalı (imza karşılaştırması buna dayanır)
    import json as _j
    assert _j.loads(_j.dumps(sig)) == sig


def test_checkpoint_roundtrip():
    sig = {"model": "large-v3", "engine": "faster", "language": "tr", "task": "transcribe",
           "split_mode": "sentence", "audio_track": -1, "hard_max_chars": 220}
    entries = [(0.0, 2.0, "Merhaba."), (2.0, 4.0, "Dünya.")]
    fd, path = tempfile.mkstemp(suffix=".ckpt.json")
    os.close(fd)
    try:
        T.write_checkpoint(path, sig, entries, 4.0)
        got = T.read_checkpoint(path, sig)
        assert got is not None
        got_entries, last_time = got
        assert last_time == 4.0
        assert len(got_entries) == 2 and got_entries[0][2] == "Merhaba."
        # imza uymuyorsa reddet (ayar değişikliği → temiz başla)
        bad = dict(sig); bad["model"] = "medium"
        assert T.read_checkpoint(path, bad) is None
    finally:
        try:
            os.remove(path)
        except OSError:
            pass


def test_read_checkpoint_missing():
    assert T.read_checkpoint(os.path.join(tempfile.gettempdir(), "yok_boyle_bir_dosya.ckpt.json"), {}) is None


def test_merge_resumed_entries():
    old = [(0.0, 40.0, "korunan"), (40.0, 80.0, "sınırı aşan — atılmalı")]
    new = [(70.0, 75.0, "eski bölge — atılmalı"), (78.5, 84.0, "yeni blok")]
    # boundary=78: old'da end>78.1 atılır (40-80 düşer); new'de start<77.5 atılır (70-75 düşer)
    merged = T.merge_resumed_entries(old, new, 78.0)
    assert len(merged) == 2
    assert merged[0][2] == "korunan"
    assert merged[1][2] == "yeni blok"


# ===== altyazı senkronlama =====
def _has_numpy():
    try:
        import numpy  # noqa: F401
        return True
    except ImportError:
        return False


def test_parse_and_shift_srt():
    srt = ("1\n00:00:01,000 --> 00:00:02,500\nMerhaba\n\n"
           "2\n00:00:03,000 --> 00:00:04,000\nDünya\niki satır\n")
    spans = T.parse_srt(srt)
    assert len(spans) == 2
    assert abs(spans[0][0] - 1.0) < 1e-6 and abs(spans[0][1] - 2.5) < 1e-6
    assert spans[0][2] == "Merhaba"
    assert spans[1][2] == "Dünya\niki satır"  # iç satır sonu korunmalı
    assert abs(T.srt_time_to_seconds("01:00:00.250") - 3600.25) < 1e-6
    assert T.shift_srt_entries(spans, -5.0)[0][0] == 0.0  # negatif → 0'a kırpılır
    assert abs(T.shift_srt_entries(spans, 2.0)[0][0] - 3.0) < 1e-6


def test_best_offset():
    if not _has_numpy():
        print("    (numpy yok — best_offset testi atlandı)")
        return
    import numpy as np
    hz = 50
    ref = np.zeros(2000, dtype=np.float32)
    for i in (200, 205, 206, 400, 401, 402, 700, 900, 901, 1200, 1500, 1501):
        ref[i:i + 15] = 1.0
    D = 60  # altyazı 60 bin (=1.2 sn) geç gösteriliyor
    sub = np.zeros_like(ref)
    sub[D:] = ref[:-D]
    off = T.best_offset(ref, sub, hz, max_shift_sec=5.0)
    # altyazı geç → uygulanacak düzeltme negatif ≈ -1.2 sn
    assert abs(off - (-D / hz)) < (2.0 / hz), f"beklenen ~{-D/hz}, bulunan {off}"


def test_build_binary_signal():
    if not _has_numpy():
        print("    (numpy yok — build_binary_signal testi atlandı)")
        return
    sig = T.build_binary_signal([(1.0, 2.0, "x")], nbins=200, hz=50)
    assert sig[50] == 1.0 and sig[99] == 1.0
    assert sig[0] == 0.0 and sig[150] == 0.0


def _run():
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    passed = 0
    failed = 0
    for t in tests:
        try:
            t()
            print(f"  PASS  {t.__name__}")
            passed += 1
        except Exception as e:
            print(f"  FAIL  {t.__name__}: {type(e).__name__}: {e}")
            failed += 1
    print(f"\n{passed} geçti, {failed} başarısız ({len(tests)} test)")
    return failed == 0


if __name__ == "__main__":
    sys.exit(0 if _run() else 1)
