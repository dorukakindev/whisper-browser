"""Altyazı cümle haritası: kaynak bloklarını değiştirmeden grup bazlı kabul."""

import math
import json
import re
import unicodedata
from pathlib import Path

SENTENCE_PROTOCOL_VERSION = 2
_BOUNDARY = re.compile(r'(?:^|\n)\s*(?:[-–—♪♫\[(]|<v\b|[^.!?:\n]{1,32}:\s)', re.I)
_END = re.compile(r'[.!?…。！？][\"\'”’)}\]]*$')
_CONTINUATION_END = re.compile(
    r'(?:\.\.\.|…|[,;:]\s*$|\b(?:and|or|but|because|if|when|while|that|which|who|to|of|for|with|as|than|so|then|ve|veya|ama|çünkü|eğer|şu|ki|ile|için|sonra)\.?\s*$)',
    re.I,
)
ABBREVIATIONS = frozenset(json.loads(Path(__file__).with_name('subtitle-abbreviations.json').read_text(encoding='utf-8')))


def normalized_text(text):
    return re.sub(r'\s+', ' ', unicodedata.normalize('NFC', str(text or ''))).strip()


_SPACELESS_SCRIPT = re.compile(r'[\u0e00-\u0e7f\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]')


def uses_spaceless_script(text):
    return bool(_SPACELESS_SCRIPT.search(normalized_text(text)))


def sentence_parts_match(whole, parts):
    """Parçaların tam cümleyi kayıpsız oluşturduğunu doğrula.

    Latin dillerinde ayırıcı boşluk anlamlıdır. Çince/Japonca/Tayca gibi doğal
    olarak boşluksuz yazılan hedeflerde sağlayıcı parça sınırına boşluk koymadan
    tam cümle döndürebilir; o durumda yalnız boşluk farkını yok sayarız.
    """
    joined = normalized_text(' '.join(parts))
    expected = normalized_text(whole)
    if joined == expected:
        return True
    if uses_spaceless_script(expected):
        return re.sub(r'\s+', '', joined) == re.sub(r'\s+', '', expected)
    return False


def sentence_ended(text):
    text = normalized_text(text).rstrip('\"\'“”‘’)}]»')
    if not _END.search(text):
        return False
    # Nokta/ünlem/soru görünse bile üç nokta, bağlaç veya edatla biten cue
    # çoğu zaman bir sonraki cue'nun devamıdır. Erken kapatmak, modelin
    # özne/nesne ilişkisini görmeden parçayı çevirmesine yol açar.
    if _CONTINUATION_END.search(text):
        return False
    last = text.split()[-1].lstrip('\"\'“”‘’([«')
    initialism = re.fullmatch(r'(?:[^\W\d_]\.){2,}', last)
    initial = len(last) == 2 and last[0].isalpha() and last[0].isupper() and last[1] == '.'
    return not (initialism or initial or (last.endswith('.') and last[:-1].lower() in ABBREVIATIONS))


_NUMBER_TOKEN = re.compile(r'(?<![\w])(?:\d+(?:[.,]\d+)?%?|\d{1,3}(?:[.,]\d{3})+(?:[.,]\d+)?)(?![\w])')
_SOURCE_NEGATION = re.compile(
    r"\b(?:not|never|no|none|nobody|nothing|neither|nor|without|hardly|cannot|can't|couldn't|didn't|doesn't|don't|hadn't|hasn't|haven't|isn't|aren't|wasn't|weren't|won't|wouldn't|shouldn't|mustn't)\b",
    re.I,
)
_TARGET_NEGATION = re.compile(
    r"\b(?:değil|degil|yok|hiç|hic|asla|kimse|hiçbir|hicbir|olmadan|yoksa|hayır|hayir|not|never|no|without|nein|nicht|pas|aucun|nunca|não|nao)\b"
    # Türkçe fiil olumsuzluğu: gelmiyor, sanmıyorum, gelmedi, yapmaz vb.
    r"|\b\w{2,}m[ıiuü]yor\w*\b|\b\w{2,}m[ae]d\w*\b|\b\w{2,}m[ae]z\w*\b"
    r"|\b\w{2,}m[ae]y?[ae]c[ae]k\w*\b|\b\w{2,}mamış\w*\b|\b\w{2,}memiş\w*\b"
    r"|\b\w{2,}mamalı\w*\b|\b\w{2,}memeli\w*\b",
    re.I,
)

_SOURCE_MODAL = re.compile(
    r"\b(?:[Cc]an|[Cc]ould|may|[Mm]ight|[Mm]ust|[Ss]hall|[Ss]hould|[Ww]ill|[Ww]ould|"
    r"[Oo]ught\s+to|[Hh]ave\s+to|[Hh]as\s+to|[Nn]eed\s+to)\b",
)
_TARGET_MODAL = re.compile(
    r"\b(?:zorunda\w*|gerek(?:iyor|ir|ecek)?|lazım|lazim|mümkün|mumkun|olabilir|belki)\b"
    r"|\b\w{2,}(?:malı|meli|abilir|ebilir|amaz|emez|acak|ecek)\w*\b",
    re.I,
)

_CURRENCY_PATTERNS = {
    'usd': re.compile(r'(?:US\$|\$|(?<!\w)(?:USD|dollars?|dolar\w*)(?!\w))', re.I),
    'eur': re.compile(r'(?:€|(?<!\w)(?:EUR|euros?|avro\w*)(?!\w))', re.I),
    'gbp': re.compile(r'(?:£|(?<!\w)(?:GBP|pounds?|sterlin\w*)(?!\w))', re.I),
    'try': re.compile(r'(?<!\w)(?:₺|TRY|TL|lira\w*)(?!\w)', re.I),
    'jpy': re.compile(r'(?<!\w)(?:¥|JPY|yen)(?!\w)', re.I),
}
_UNIT_PATTERNS = {
    'km': re.compile(r'(?<!\w)(?:km|kilometers?|kilometre\w*)(?!\w)', re.I),
    'm': re.compile(r'(?<!\w)(?:m|meters?|metre\w*)(?!\w)', re.I),
    'kg': re.compile(r'(?<!\w)(?:kg|kilograms?|kilogram\w*)(?!\w)', re.I),
    'g': re.compile(r'(?<!\w)(?:g|grams?|gram\w*)(?!\w)', re.I),
    'l': re.compile(r'(?<!\w)(?:l|liters?|litre\w*)(?!\w)', re.I),
    'mile': re.compile(r'(?<!\w)(?:miles?|mil)(?!\w)', re.I),
    'hour': re.compile(r'(?<!\w)(?:hours?|hrs?|saat\w*)(?!\w)', re.I),
    'minute': re.compile(r'(?<!\w)(?:minutes?|mins?|dakika\w*)(?!\w)', re.I),
    'second': re.compile(r'(?<!\w)(?:seconds?|secs?|saniye\w*)(?!\w)', re.I),
    'celsius': re.compile(r'(?<!\w)(?:°\s*C|degrees?\s+Celsius|santigrat\w*)(?!\w)', re.I),
}
_MONTH_PATTERNS = {
    'jan': re.compile(r'\b(?:January|Jan\.?|Ocak)\b', re.I),
    'feb': re.compile(r'\b(?:February|Feb\.?|Şubat|Subat)\b', re.I),
    'mar': re.compile(r'\b(?:March|Mar\.?|Mart)\b', re.I),
    'apr': re.compile(r'\b(?:April|Apr\.?|Nisan)\b', re.I),
    # İngilizce modal "may" ay adı değildir; İngilizce ay adı büyük harfle,
    # Türkçe karşılıkları kendi doğal yazımlarıyla kabul edilir.
    'may': re.compile(r'\b(?:May|Mayıs|Mayis|mayıs|mayis)\b'),
    'jun': re.compile(r'\b(?:June|Jun\.?|Haziran)\b', re.I),
    'jul': re.compile(r'\b(?:July|Jul\.?|Temmuz)\b', re.I),
    'aug': re.compile(r'\b(?:August|Aug\.?|Ağustos|Agustos)\b', re.I),
    'sep': re.compile(r'\b(?:September|Sep\.?|Sept\.?|Eylül|Eylul)\b', re.I),
    'oct': re.compile(r'\b(?:October|Oct\.?|Ekim)\b', re.I),
    'nov': re.compile(r'\b(?:November|Nov\.?|Kasım|Kasim)\b', re.I),
    'dec': re.compile(r'\b(?:December|Dec\.?|Aralık|Aralik)\b', re.I),
}


def _semantic_markers(text, patterns):
    return {name for name, pattern in patterns.items() if pattern.search(str(text or ''))}


def _number_tokens(text):
    def canonical(token):
        token = token.replace('%', '')
        if re.fullmatch(r'\d{1,3}(?:[.,]\d{3})+', token):
            return token.replace('.', '').replace(',', '')
        return token.replace(',', '.')
    return [canonical(token) for token in _NUMBER_TOKEN.findall(str(text or ''))]


_TR_ONES = ('sıfır', 'bir', 'iki', 'üç', 'dört', 'beş', 'altı', 'yedi', 'sekiz', 'dokuz')
_TR_TENS = ('', 'on', 'yirmi', 'otuz', 'kırk', 'elli', 'altmış', 'yetmiş', 'seksen', 'doksan')


def _turkish_integer_words(value):
    """Sayısal kaynakların doğal Türkçe yazıyla korunmasını tanır (80 → seksen)."""
    value = int(value)
    if value < 0 or value > 999999999:
        return ''
    if value < 10:
        return _TR_ONES[value]
    if value < 100:
        return ' '.join(part for part in (_TR_TENS[value // 10], _TR_ONES[value % 10] if value % 10 else '') if part)
    if value < 1000:
        head = 'yüz' if value // 100 == 1 else f'{_TR_ONES[value // 100]} yüz'
        tail = _turkish_integer_words(value % 100) if value % 100 else ''
        return ' '.join(part for part in (head, tail) if part)
    for scale, word in ((1000000, 'milyon'), (1000, 'bin')):
        if value >= scale:
            count, remainder = divmod(value, scale)
            head = word if count == 1 else f'{_turkish_integer_words(count)} {word}'
            tail = _turkish_integer_words(remainder) if remainder else ''
            return ' '.join(part for part in (head, tail) if part)
    return ''


def _number_preserved(token, translated, target_lang):
    if token in _number_tokens(translated):
        return True
    if str(target_lang or '').lower().split('-')[0] != 'tr':
        return False
    try:
        value = float(token)
    except ValueError:
        return False
    if not value.is_integer():
        return False
    words = _turkish_integer_words(int(value))
    return bool(words and re.search(r'(?<!\w)' + re.escape(words) + r'(?!\w)', normalized_text(translated), re.I))


def translation_meaning_issues(source_text, translated_text, target_lang='tr'):
    """Bariz sayı/olumsuzluk kaybını anlamsal kalite kapısı olarak bildirir.

    Bu bir dilbilgisi puanı değildir; yalnızca güvenilir biçimde korunması
    gereken küçük ama kritik işaretleri denetler. Sonuç kodları yeniden deneme,
    önbellek geçersizleştirme ve raporlama için kullanılır.
    """
    source = normalized_text(source_text)
    translated = normalized_text(translated_text)
    issues = []
    source_numbers = _number_tokens(source)
    if source_numbers:
        missing = [token for token in source_numbers
                   if not _number_preserved(token, translated, target_lang)]
        if missing:
            issues.append('number_mismatch')
    if _SOURCE_NEGATION.search(source) and not _TARGET_NEGATION.search(translated):
        issues.append('negation_missing')
    if _SOURCE_MODAL.search(source) and not _TARGET_MODAL.search(translated):
        issues.append('modal_missing')
    for issue, patterns in (
            ('currency_mismatch', _CURRENCY_PATTERNS),
            ('unit_mismatch', _UNIT_PATTERNS),
            ('date_mismatch', _MONTH_PATTERNS)):
        source_markers = _semantic_markers(source, patterns)
        if source_markers and not source_markers.issubset(_semantic_markers(translated, patterns)):
            issues.append(issue)
    return issues


def translation_blocking_issues(source_text, translated_text, target_lang='tr'):
    """Otomatik reddi yalnız kesin yapısal kayıplara uygula.

    Olumsuzluk sezgisi tanı amaçlı kalır: Türkçe olumsuzluk çekimleri ve doğal
    yeniden anlatım regex ile güvenilir biçimde kanıtlanamaz.
    """
    return [issue for issue in translation_meaning_issues(
        source_text, translated_text, target_lang) if issue == 'number_mismatch']


def sentence_groups(entries, max_gap=1.2, max_chars=280, max_duration=12, max_parts=6,
                    speakers=None):
    """Her giriş tam bir gruba aittir; zamanlar/sıra/kelimeler değiştirilmez.

    Konuşmacı/SDH işareti taşıyan, örtüşen veya zamanı bozuk bloklar tek kalır.
    Etiketsiz konuşmacı değişimi yalnız metinden kesin olarak saptanamaz.
    """
    groups, group = [], []
    length = 0

    def protected(index):
        start, end, text = entries[index]
        try:
            start, end = float(start), float(end)
        except (TypeError, ValueError):
            return True
        return (not math.isfinite(start) or not math.isfinite(end)
                or end <= start or not normalized_text(text)
                or bool(_BOUNDARY.search(str(text).strip())))

    for index, (start, end, text) in enumerate(entries):
        size = len(normalized_text(text))
        if group:
            previous = group[-1]
            current_protected = protected(index)
            previous_protected = protected(previous)
            if current_protected or previous_protected:
                groups.append(group)
                group, length = [], 0
            else:
                gap = float(start) - float(entries[previous][1])
                speaker_changed = bool(speakers and speakers.get(index)
                                       and speakers.get(previous)
                                       and speakers.get(index) != speakers.get(previous))
                if (speaker_changed or not -0.05 <= gap <= max_gap
                        or float(end) - float(entries[group[0]][0]) > max_duration
                        or length + 1 + size > max_chars or len(group) >= max_parts):
                    groups.append(group)
                    group, length = [], 0
        group.append(index)
        length += size + (1 if len(group) > 1 else 0)
        if protected(index) or sentence_ended(text):
            groups.append(group)
            group, length = [], 0
    if group:
        groups.append(group)
    return groups


def pack_sentence_groups(groups, limit=20):
    """İstek sınırı veya aradaki cache isabeti cümleyi ikiye bölmez."""
    chunks, current = [], []
    for group in groups:
        if current and (group[0] != current[-1] + 1 or len(current) + len(group) > limit):
            chunks.append(current)
            current = []
        current.extend(group)
    if current:
        chunks.append(current)
    return chunks


def validate_sentence_parts(whole, parts, count):
    if (not isinstance(whole, str) or not normalized_text(whole) or len(whole) > 12000
            or not isinstance(parts, list) or len(parts) != count
            or any(not isinstance(part, str) or not normalized_text(part) for part in parts)):
        return None
    # Sadece boşluk/NFC farkına izin ver: sözcük/noktalama ekleme, silme veya
    # yineleme yerleştirme aşamasında sessizce kabul edilmesin.
    if not sentence_parts_match(whole, parts):
        return None
    return {"text": normalized_text(whole), "parts": [part.strip() for part in parts]}


def accept_sentence_reply(data, ids):
    """Çok bloklu grup ya bütünüyle kabul edilir ya hiç uygulanmaz.

    Eski düz ID→metin yanıtları yalnız bağımsız tek bloklarda uyumluluk için
    kabul edilir. Çok bloklu grupta ayrı tam çeviri kanıtı zorunludur.
    """
    if not isinstance(data, dict):
        return None
    items = data.get('items', data)
    wholes = data.get('sentences', {})
    if not isinstance(items, dict) or not isinstance(wholes, dict):
        return None
    parts = [items.get(str(index)) for index in ids]
    whole = wholes.get(str(ids[0]))
    if len(ids) == 1 and whole is None:
        whole = parts[0]
    return validate_sentence_parts(whole, parts, len(ids))
