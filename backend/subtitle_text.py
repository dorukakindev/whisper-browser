"""Lightweight shared subtitle byte decoding and conservative text repair."""
import re

_CP1254_FIXUP = str.maketrans({
    "Ð": "Ğ", "Ý": "İ", "Þ": "Ş", "ð": "ğ", "ý": "ı", "þ": "ş",
})

# Çift kodlanmış UTF-8 izleri ("Ã§ocuk", "gÃ¼zel", "Åžey"): metin UTF-8 iken
# latin-1 sanılıp yeniden kodlanmış demektir.
_MOJIBAKE_MARKERS = ("Ã§", "Ã¼", "Ã¶", "Ä±", "ÄŸ", "Å", "Ã‡", "Ãœ", "Ã–", "Ä°", "Ã¢")


def repair_mojibake(text):
    """Çift kodlanmış UTF-8'i onarır. Bozulma yoksa metne DOKUNMAZ."""
    if not text or not any(m in text for m in _MOJIBAKE_MARKERS):
        return text, False
    try:
        fixed = text.encode("latin-1", errors="strict").decode("utf-8", errors="strict")
    except (UnicodeEncodeError, UnicodeDecodeError):
        return text, False
    # Onarım gerçekten iyileştirdi mi? (işaretler kayboldu mu)
    if sum(fixed.count(m) for m in _MOJIBAKE_MARKERS) < sum(text.count(m) for m in _MOJIBAKE_MARKERS):
        return fixed, True
    return text, False


def repair_cp1254_as_latin1(text):
    """
    cp1254 dosya latin-1 okunup UTF-8 kaydedilmişse Türkçe harfler "Ð Ý Þ ð ý þ"
    olarak DONAR — dosya geçerli UTF-8'dir, bu yüzden kodlama denemesi yakalamaz.
    Yanlış onarımı önlemek için iki koşul aranır: bu harfler birkaç kez geçiyor VE
    metinde gerçek Türkçe harfler (ğ ı ş İ Ğ Ş) hiç yok (yani hepsi bozulmuş).
    """
    if not text:
        return text, False
    suspicious = sum(text.count(ch) for ch in "ÐÝÞðýþ")
    if suspicious < 3:
        return text, False
    if any(ch in text for ch in "ğışİĞŞ"):
        return text, False        # sağlam Türkçe harf var - bunlar gerçek olabilir
    # İzlandaca'da þ/ð/ý GERÇEK harflerdir. Ayırt edici: Türkçede hiç kullanılmayan
    # aksanlı ünlüler (á é í ó ú) ve æ. Bunlar varsa metin Türkçe değildir - dokunma.
    # Saf þ/ð/ý'li metin iki yönde de belirsizdir; tipik İzlandaca işlev
    # sözcükleri gerçek metni mojibake'den ayırır (B83-36).
    if any(ch in text for ch in "áéíóúÁÉÍÓÚæÆøåÅ"):
        return text, False
    if re.search(r"\b(?:það|og|að|ekki|með|ég|við|þú|hann|hún|orð)\b", text):
        return text, False
    return text.translate(_CP1254_FIXUP), True


def decode_subtitle_bytes(raw):
    """
    Dış altyazı dosyasını kodlamasını tespit ederek okur. Sıra:
      1. UTF-8 (BOM'lu/BOM'suz) — bizim ve çoğu modern dosyanın kodlaması
      2. cp1254 (Türkçe Windows) — eski Türkçe altyazılarda yaygın
      3. latin-1 (asla hata vermez, son çare)
    Ayrıca çift kodlanmış UTF-8 ve latin-1 okunmuş cp1254 izleri onarılır.
    Döner: (metin, kullanılan_kodlama, onarım_yapıldı_mı)
    """
    # UTF-32LE starts with the UTF-16LE BOM too; test the longest signature first.
    # An explicit Unicode signature must never fall back to a legacy codec:
    # that silently turns a truncated subtitle into spoken garbage.
    unicode_encoding = None
    for signature, encoding in ((b"\xef\xbb\xbf", "utf-8-sig"),
                                (b"\xff\xfe\x00\x00", "utf-32"),
                                (b"\x00\x00\xfe\xff", "utf-32"),
                                (b"\xff\xfe", "utf-16"), (b"\xfe\xff", "utf-16")):
        if raw.startswith(signature):
            unicode_encoding = encoding
            break
    if unicode_encoding:
        text = raw.decode(unicode_encoding)
        fixed, repaired = repair_mojibake(text)
        fixed2, repaired2 = repair_cp1254_as_latin1(fixed)
        if unicode_encoding == "utf-8-sig":
            return fixed2, unicode_encoding, (repaired or repaired2)
        endian = "le" if raw.startswith(b"\xff\xfe") else "be"
        return fixed2, unicode_encoding + endian, (repaired or repaired2)
    # BOM-less UTF-16 subtitle headers contain alternating ASCII/NUL bytes.
    # Require several such pairs and a valid subtitle timing/header signature.
    if len(raw) >= 16 and len(raw) % 2 == 0:
        sample = raw[:2048]
        for encoding, parity in (("utf-16-le", 1), ("utf-16-be", 0)):
            lane = sample[parity::2]
            if lane.count(0) < max(4, len(lane) * .4):
                continue
            try:
                text = raw.decode(encoding)
            except UnicodeDecodeError:
                continue
            if re.search(r"-->\s|^WEBVTT|\[Script Info\]", text, re.MULTILINE):
                return text, encoding.replace("-le", "le").replace("-be", "be"), False
    for enc in ("utf-8-sig", "cp1254"):
        try:
            text = raw.decode(enc)
        except UnicodeDecodeError:
            continue
        fixed, repaired = repair_mojibake(text)
        fixed2, repaired2 = repair_cp1254_as_latin1(fixed)
        return fixed2, enc, (repaired or repaired2)
    text = raw.decode("latin-1", errors="replace")
    # latin-1'e düştüysek büyük olasılıkla cp1254 idi — Türkçe harfleri geri koy
    if any(ch in text for ch in "ÐÝÞðýþ"):
        return text.translate(_CP1254_FIXUP), "latin-1 (cp1254 onarımı)", True
    return text, "latin-1", False


def read_subtitle_text(path):
    with open(path, "rb") as subtitle_file:
        return decode_subtitle_bytes(subtitle_file.read())

