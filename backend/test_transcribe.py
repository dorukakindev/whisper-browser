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


def test_longest_unpunctuated_run():
    entries = [
        (0, 1, "This is a sentence."),
        (1, 2, "then a run without"),
        (2, 3, "any final punctuation here"),
        (3, 4, "Now it ends."),
    ]
    assert T.longest_unpunctuated_run(entries) == 11


def test_ordinal_language_conventions():
    # İngilizce: "He died in 1935." gerçek cümle sonu (sıra sayısı kuralı yok)
    T.set_language_conventions("en")
    assert T.is_abbreviation("1935.") is False
    assert T.is_abbreviation("Mrs.") is True          # kısaltmalar dilden bağımsız
    # Türkçe: "2. Dünya Savaşı" — cümle ortasında sıra sayısı bölmeyi engeller
    T.set_language_conventions("tr")
    assert T.is_abbreviation("2.") is True
    # metin SONUNDA rakam+nokta her dilde cümle sonudur
    assert T.text_ends_sentence("He died in 1935.") is True
    assert T.text_ends_sentence("Stay with 4.") is True
    T.set_language_conventions("tr")  # varsayılanı geri koy (diğer testler için)


def test_is_abbreviation():
    for w in ("Mrs.", "Dr.", "L.A.", "U.S.", "2.", "J.", "vb.", "Prof."):
        assert T.is_abbreviation(w) is True, w
    for w in ("man.", "again.", "no.", "Egger", "Osterreich."):
        assert T.is_abbreviation(w) is False, w
    # kısaltma cümleyi bitirmez, gerçek nokta bitirir
    assert T.text_ends_sentence("He met Mrs.") is False
    assert T.text_ends_sentence("He met her.") is True


def test_merge_incomplete_sentences():
    entries = [
        (10.0, 11.5, "A Christmas Day gathering"),
        (11.5, 13.0, "led to the death of this man"),
        (13.0, 14.0, "for a full two years."),
        (14.2, 15.0, "A new sentence."),
        (15.2, 16.0, "- Who is there?"),
        (16.1, 17.0, "- Nobody"),
    ]
    out = T.merge_incomplete_sentences(entries, max_chars=160, max_dur=7.0)
    assert out[0][2] == ("A Christmas Day gathering led to the death of this man "
                         "for a full two years.")
    assert out[1][2] == "A new sentence."          # tam cümle birleşmez
    assert out[2][2] == "- Who is there?"          # diyalog tiresi korunur
    assert len(out) == 4
    # uzun sessizlik ayrı bırakılır
    far = [(0.0, 2.0, "yarım bir cümle"), (9.0, 11.0, "devamı geldi.")]
    assert len(T.merge_incomplete_sentences(far)) == 2


# ===== noktalama çöküşü tespiti =====
def test_find_unpunctuated_spans():
    # 100 kelimelik noktasız bölge + öncesinde/sonrasında düzgün cümleler
    entries = [(0.0, 3.0, "This is a properly punctuated sentence.")]
    t = 3.0
    for i in range(20):
        entries.append((t, t + 3.0, " ".join(f"word{i}{j}" for j in range(5))))
        t += 3.0
    entries.append((t, t + 3.0, "And here punctuation returns."))
    spans = T.find_unpunctuated_spans(entries, min_words=80)
    assert len(spans) == 1
    assert spans[0][0] == 3.0 and spans[0][1] == t + 3.0
    # noktalama düzgünse hiç bölge çıkmaz
    ok = [(i * 2.0, i * 2.0 + 2.0, "Short clean sentence here.") for i in range(40)]
    assert T.find_unpunctuated_spans(ok, min_words=80) == []
    # nokta yok ama virgül + büyük harf var → uzun cümle, çöküş DEĞİL (Loch Ness vakası)
    longsent = [(0.0, 3.0, "This is a properly punctuated sentence.")]
    t = 3.0
    for i in range(20):
        longsent.append((t, t + 3.0, "And then, in the dark, something moved slowly"))
        t += 3.0
    assert T.find_unpunctuated_spans(longsent, min_words=80) == []


def test_drop_trailing_hallucination():
    # nötr son blok: ne kapanış kalıbı ne de kısaltma ("Son." kalıp listesinde — alta bak)
    base = [(0, 3, "Bu bir cümledir."), (3, 6, "Bu da bir cümledir."), (6, 7, "Sessizlik.")]
    hi = [{"word": "Sessizlik.", "start": 6.2, "end": 6.8, "probability": 0.95}]
    lo = [{"word": "Sessizlik.", "start": 6.2, "end": 6.8, "probability": 0.20}]
    # kanıt yoksa (yüksek güven, ses ölçümü yok) korunur
    assert len(T.drop_trailing_hallucination(base, hi, None, None, 0.0)) == 3
    # düşük güven → atılır
    assert len(T.drop_trailing_hallucination(base, lo, None, None, 0.0)) == 2
    # önceki blok cümle bitirmiyorsa bu blok devamıdır → korunur
    cont = [(0, 3, "Bu bir cümledir."), (3, 6, "yarım kalan"), (6, 7, "devam.")]
    assert len(T.drop_trailing_hallucination(cont, lo, None, None, 0.0)) == 3
    # 2 kelimeden uzun kapanış → korunur
    longer = [(0, 3, "Bir."), (3, 6, "İki."), (6, 8, "Bu uzun bir kapanış cümlesi.")]
    assert len(T.drop_trailing_hallucination(longer, lo, None, None, 0.0)) == 3
    # tipik kapanış uydurmaları kanıt gerektirmeden atılır (yapısal koşullar sağlıysa)
    for phrase in ("Thank you.", "The End", "Teşekkürler.", "Bye.", "Son."):
        case = [(0, 3, "Bir cümle."), (3, 6, "İkinci cümle."), (6, 7, phrase)]
        assert len(T.drop_trailing_hallucination(case, hi, None, None, 0.0)) == 2, phrase
    # normal kısa kapanışlar korunur
    for phrase in ("Suicide.", "Action.", "Dignity."):
        case = [(0, 3, "Bir cümle."), (3, 6, "İkinci cümle."), (6, 7, phrase)]
        assert len(T.drop_trailing_hallucination(case, hi, None, None, 0.0)) == 3, phrase
    # film ORTASINDAKİ "Thank you." etkilenmez (son blok değil)
    mid = [(0, 3, "Bir cümle."), (3, 6, "Thank you."), (6, 9, "Devam eden anlatım.")]
    assert len(T.drop_trailing_hallucination(mid, hi, None, None, 0.0)) == 3
    # üst üste gelen kapanış uydurmaları hepsi atılır (max_drop)
    multi = [(0, 3, "Bir cümle."), (3, 6, "İkinci cümle."), (6, 7, "Thank you."), (7, 8, "The End")]
    assert len(T.drop_trailing_hallucination(multi, hi, None, None, 0.0)) == 2


def test_merge_short_entries_abbreviation():
    # "Mrs." cümle sonu değil → sonraki kısa blokla birleşmeli
    T.set_language_conventions("en")
    out = T.merge_short_entries([(0.0, 2.0, "He was the secret lover of Mrs."),
                                 (2.1, 3.0, "Dolly.")], max_gap=0.6)
    assert len(out) == 1 and out[0][2] == "He was the secret lover of Mrs. Dolly."
    # gerçek cümle sonundan sonra birleştirme yok
    out2 = T.merge_short_entries([(0.0, 2.0, "He died in 1935."), (2.1, 3.0, "Then.")],
                                 max_gap=0.6)
    assert len(out2) == 2
    T.set_language_conventions("tr")


def test_find_script_contamination():
    e = [(0, 2, "The image that myалось to come up"), (2, 4, "Normal English line.")]
    hits = T.find_script_contamination(e, "en")
    assert len(hits) == 1 and hits[0][1] == "kiril"
    # Rusça altyazıda Kiril beklenen yazıdır → bulgu yok
    assert T.find_script_contamination(e, "ru") == []
    # Türkçe metin (ç, ğ, ş) latin alfabesidir → bulgu yok
    assert T.find_script_contamination([(0, 2, "Çağrışım güçlüydü.")], "tr") == []


def test_find_suspicious_gaps():
    # cümle yarıda kesilip 90 sn sonra devam ediyor → şüpheli
    e = [(0, 5, "The advent of prohibition,"), (95, 100, "the mobs of major cities")]
    assert len(T.find_suspicious_gaps(e)) == 1
    # cümle tam bitmişse uzun boşluk normaldir (müzik/montaj bölümü)
    ok = [(0, 5, "That was the end of it."), (95, 100, "A new chapter begins.")]
    assert T.find_suspicious_gaps(ok) == []
    # kısa boşluk şüpheli değil
    short = [(0, 5, "half a sentence"), (12, 15, "continues here.")]
    assert T.find_suspicious_gaps(short) == []


def test_build_confidence_report():
    entries = [
        (10.0, 14.0, "Otto Sanhuber was the secret lover of Mrs. Dolly Osterreich."),
        (20.0, 23.0, "The lords of Shibalba were called one death and seven death."),
        (30.0, 33.0, "Okay."),
    ]
    words = [
        {"word": "Sanhuber", "start": 10.5, "end": 11.0, "probability": 0.41},
        {"word": "Osterreich", "start": 13.0, "end": 13.6, "probability": 0.38},
        {"word": "Shibalba", "start": 21.0, "end": 21.5, "probability": 0.32},
        {"word": "Shibalba", "start": 22.0, "end": 22.4, "probability": 0.29},
        {"word": "the", "start": 11.2, "end": 11.4, "probability": 0.20},   # gürültü
        {"word": "Okay.", "start": 30.5, "end": 31.0, "probability": 0.18}, # gürültü
        {"word": "lover", "start": 12.0, "end": 12.4, "probability": 0.95}, # eşik üstü
    ]
    text, count, frequent = T.build_confidence_report(entries, words, threshold=0.6)
    assert count == 4, count                       # gürültü ve eşik üstü elendi
    assert frequent == [("shibalba", 2)]           # yalnızca tekrar edenler sözlük adayı
    assert "Sanhuber (0.41)" in text and "Osterreich (0.38)" in text
    assert "Okay" not in text and "the (0.20)" not in text
    # bağlam: kelime ait olduğu bloğun metniyle birlikte gösterilir
    assert "Otto Sanhuber was the secret lover" in text
    # düşük güvenli kelime yoksa rapor üretilmez
    assert T.build_confidence_report(entries, [words[-1]], threshold=0.6) == ("", 0, [])


def test_punctuation_ratio():
    assert T.punctuation_ratio([(0, 1, "one two three four.")]) == 0.25
    assert T.punctuation_ratio([(0, 1, "no punctuation at all")]) == 0.0
    # kısaltma cümle sonu sayılmaz
    assert T.punctuation_ratio([(0, 1, "He met Mrs. Dolly")]) == 0.0


# ===== yaygın hata düzeltme =====
def test_fix_text_artifacts():
    assert T.fix_text_artifacts("Merhaba,nasılsın?") == "Merhaba, nasılsın?"
    assert T.fix_text_artifacts("Geldi.Sonra gitti.") == "Geldi. Sonra gitti."
    assert T.fix_text_artifacts("Ne oldu!!!") == "Ne oldu!"
    assert T.fix_text_artifacts("Bak--sonra") == "Bak…sonra"
    assert T.fix_text_artifacts(">> Konuşmacı: merhaba") == "Konuşmacı: merhaba"
    # sayı ve kısaltmalara DOKUNULMAZ
    assert T.fix_text_artifacts("Bir 3.14 sayısı") == "Bir 3.14 sayısı"
    assert T.fix_text_artifacts("L.A. County Jail") == "L.A. County Jail"
    # diyalog tiresi korunur
    assert T.fix_text_artifacts("- Kim var orada?") == "- Kim var orada?"


def test_capitalize_after_sentence():
    T.set_language_conventions("tr")
    entries = [
        (0, 1, "Bu bir cümle."),
        (1, 2, "ikinci cümle geldi."),      # Türkçe: i -> İ olmalı (I değil)
        (2, 3, "devam ediyor"),             # önceki cümle bitmiş -> büyük harf
        (3, 4, "istanbul güzel."),          # önceki bitmemiş -> DOKUNMA
    ]
    out, n = T.capitalize_after_sentence(entries, "tr")
    assert n == 2
    assert out[1][2].startswith("İkinci"), out[1][2]
    assert out[2][2].startswith("Devam")
    assert out[3][2].startswith("istanbul")
    # İngilizcede normal upper
    en, _ = T.capitalize_after_sentence([(0, 1, "It ends."), (1, 2, "it starts.")], "en")
    assert en[1][2].startswith("It")


def test_strip_repeated_prefix():
    # karaoke artefaktı: sonraki blok öncekini aynen içeriyor
    k = [(0, 2, "The Addis continue to live"),
         (2, 4, "The Addis continue to live according to their customs.")]
    out, n = T.strip_repeated_prefix(k)
    assert n == 1 and out[1][2] == "according to their customs"
    # uzun boşlukta dokunulmaz (gerçek tekrar olabilir)
    far = [(0, 2, "The Addis continue to live"),
           (30, 34, "The Addis continue to live according to their customs.")]
    _out, n2 = T.strip_repeated_prefix(far)
    assert n2 == 0


def test_drop_micro_blocks():
    m = [(0, 0.03, "Ah"), (1, 3, "Normal bir cümle.")]
    out, n = T.drop_micro_blocks(m)
    assert n == 1 and len(out) == 1
    # kısa ama çok kelimeli blok korunur (gerçek konuşma olabilir)
    keep = [(0, 0.05, "bir iki üç dört"), (1, 3, "Cümle.")]
    _o, n2 = T.drop_micro_blocks(keep)
    assert n2 == 0


# ===== çeviri =====
def test_resolve_translate_routes():
    # shuaiapi rotası verilirse dördü de denenir, verilen ilk sırada
    r = T.resolve_translate_routes("https://oai.sb/v1")
    assert r[0] == "https://oai.sb/v1" and len(r) == 4
    assert "https://api.shuaiapi.com/v1" in r
    # başka sağlayıcıda yedekleme yok (tek endpoint)
    assert T.resolve_translate_routes("https://api.deepseek.com") == ["https://api.deepseek.com"]
    # boşsa varsayılan rota
    assert T.resolve_translate_routes("") == [T.SHUAI_ROUTES[0][1]]


def test_build_translate_prompt():
    p = T.build_translate_prompt("tr", "en", ["Sanhuber", "Osterreich"],
                                 register="documentary", profanity="explicit",
                                 max_cps=21, max_line_width=42)
    assert "Sanhuber, Osterreich" in p          # sözlük prompta giriyor
    assert "21 karakter/saniye" in p            # CPS bütçesi
    assert "GUVENILMEZ" in p                    # prompt injection koruması
    assert "YER DEGISTIRME" in p                # blok hizası kuralı
    # üslup ve küfür seçimi prompta yansır
    assert "Anlatici cumleleri" in p
    assert "sansursuz" in p.lower()
    soft = T.build_translate_prompt("tr", "en", [], profanity="soft")
    assert "yumusat" in soft.lower() and "sansursuz" not in soft.lower()


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

    # Film presetindeki 42x2 hedefi gerçekten uygulanmalı; soft_max_chars eskiden
    # kullanılmadığı için bu tür metinler tek blokta kalıp üç satıra taşıyordu.
    text3 = ("The bizarre phenomenon of serial killers in the United States, which "
             "coincided with the so-called satanic panic, became widespread.")
    raw3 = text3.split()
    words3 = []
    for i, word in enumerate(raw3):
        words3.append(W((" " if i else "") + word, i * 0.3, (i + 1) * 0.3))
    seg3 = Seg(0.0, len(raw3) * 0.3, text3, words3)
    chunks3 = T.split_segment_sentence(seg3, hard_max_chars=220, soft_max_chars=84)
    assert len(chunks3) >= 2
    assert all(len(chunk[2]) <= 84 for chunk in chunks3)
    assert all(len(chunk[2]) >= 30 for chunk in chunks3), "öksüz kısa blok üretildi"


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
