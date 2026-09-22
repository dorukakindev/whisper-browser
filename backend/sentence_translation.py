"""Altyazı cümle haritası: kaynak bloklarını değiştirmeden grup bazlı kabul."""

import math
import json
import re
import unicodedata
from pathlib import Path

SENTENCE_PROTOCOL_VERSION = 3
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


_END_RUN = re.compile(r'[.!?…]+[\"\'”’)}\]]*')


def _numeric_separator(text, match):
    """'3.000' / '2.4' / 'v1.2' — iki rakam arasındaki nokta cümle sonu değildir.

    Türkçe binlik ayraç ve ondalık nokta ('Kasada 3.000 sikke vardı.') satır
    sonu ekleme ve cümle-sonu kotasını kandırıyordu: '3.' gerçek bitiş sanılıp
    sayının ortasına `\n` konuyordu.
    """
    i = match.start() - 1
    while i >= 0 and text[i] in "\"'”’)}] ":
        i -= 1
    prev = text[i] if i >= 0 else ""
    j = match.end()
    while j < len(text) and text[j] in "\"'”’)}] ":
        j += 1
    nxt = text[j] if j < len(text) else ""
    return prev.isdigit() and nxt.isdigit()


def sentence_end_count(text):
    """Metindeki gerçek cümle sonu sayısı (kısaltma/üç nokta sayılmaz)."""
    text = normalized_text(text)
    return sum(1 for match in _END_RUN.finditer(text)
               if not _numeric_separator(text, match)
               and sentence_ended(text[:match.end()]))


def internal_sentence_end_count(text):
    """Parça İÇİNDE tamamlanan cümle sayısı (parçanın kendi sonu hariç).

    "Wait. Are you sure" gibi gövdesinde tam cümle barındıran parçaların
    hedef karşılığı da bir cümleyle kapanabilir ("Bekle.") — bu kota olmadan
    istenen davranış kalite kapısında reddediliyordu.
    """
    text = normalized_text(text)
    return sum(1 for match in _END_RUN.finditer(text)
               if not _numeric_separator(text, match)
               and sentence_ended(text[:match.end()])
               and normalized_text(text[match.end():]))


def sentence_part_boundary_issue(source_parts, translated_parts):
    """Hedefin cümleyi kaynak cue'da olandan fazla cümleyle kapatmasını engelle.

    Kota = kaynak parçanın içerdiği toplam tam cümle sayısı. Böylece gövdesinde
    "Wait." gibi tamamlanmış cümle taşıyan bir parçanın Türkçe karşılığı
    "Bekle." ile bitebilir; ancak kaynakta devam eden parça hedef parçada
    ekstra cümle sonu taşıyamaz (yüklem erken bitmiş gibi görünürdü).
    """
    if (not isinstance(source_parts, (list, tuple))
            or not isinstance(translated_parts, (list, tuple))
            or len(source_parts) != len(translated_parts)):
        return "cue_siniri_gecersiz"
    for index in range(max(0, len(source_parts) - 1)):
        if sentence_end_count(translated_parts[index]) > sentence_end_count(source_parts[index]):
            return f"erken_cumle_sonu:{index}"
    return ""


# Parça SONUNDA duramayan Türkçe sözcükler: bunlarla biten parça ya ek/bağlaç
# ortasından kesilmiştir ("...değil" + "mi", "...zorunda" + "kaldı") ya da doğal
# bir durak değildir. Son parça (grubun cümle sonu) denetlenmez. Edatlar
# (için/gibi/kadar/ile/beri/göre/dolayı/yüzünden), soru eki (mi/mı/mu/mü) ve
# 'de/da/ya/ki' sonda DOĞAL cümlecik kapanışıdır ("X için,", "Doğru mu?",
# "gördüm ki.") — sarkık listesine konmazlar; aksi halde doğru altcümle
# kesimini yanlış-pozitifle bloklarlar.
_DANGLING_TAIL = frozenset(
    "ve veya yahut ne hem diye değil degil emin zorunda hâlâ hala ama fakat "
    "ancak çünkü cunku eğer eger madem hatta bile ise sanki adeta her bir bu "
    "şu su o".split())


def part_tail_issue(translated_parts, target_lang="tr"):
    """Türkçe hedef parçanın ek/bağlaç/birleşik anlam yapısı ortasından kesilmesini yakala."""
    if str(target_lang or "").lower().split("-")[0] != "tr":
        return ""
    for index in range(max(0, len(translated_parts) - 1)):
        tail = normalized_text(translated_parts[index]).rstrip('…,.!?;:"\'”’)]}')
        last = tail.split()[-1].lower() if tail else ""
        if last in _DANGLING_TAIL:
            return f"acik_baglanti:{index}"
    return ""


def part_repetition_issue(source_parts, translated_parts):
    """Farklı kaynak parçalara aynı hedef parça döndürülmesini yakala."""
    previous_source = previous_target = None
    for index, (source, translated) in enumerate(zip(source_parts, translated_parts)):
        source_n, translated_n = normalized_text(source), normalized_text(translated)
        if (translated_n and previous_target and translated_n == previous_target
                and source_n != previous_source):
            return f"tekrarli_part:{index}"
        previous_source, previous_target = source_n, translated_n
    return ""


_NAME_TOKEN = re.compile(r"[A-Za-zÇĞİÖŞÜçğıöşüΑ-Ωα-ωА-Яа-я][\w'’.\-]*", re.UNICODE)

# Gün/ay adları özel ad sayılmaz: meşru yerelleştirme (Tuesday→Salı) tarih
# denetimi katmanında zaten korunur; burada zorlamak yerelleştirmeyi bloklar.
_WEEKDAY_MONTH = frozenset(
    "monday tuesday wednesday thursday friday saturday sunday "
    "january february march april may june july august september october "
    "november december".split())
# Satır başındaki SDH/konuşmacı işaretleri taranıp ad-sayacı kandırılmaz:
# "[distorted] Run!" ve "MAN: Hold your fire!" örneklerinde ilk gerçek kelime
# cümle-ilk sayılmalı, özel ad değil.
_LEADING_MARKERS = re.compile(
    r"^(?:\s*(?:\[[^\[\]]{0,60}\]|\([^\(\)]{0,60}\)|[♪♫]+|[A-ZÇĞİÖŞÜ]{2,}:))+\s*")
# Hedef parçada SDH "tür" araması: içerik yerelleşebilir ([GUNFIRE]→[SİLAH
# SESLERİ]) ama işaret türü aynı cue'da kalmalı; işaretin bütünüyle düşmesi
# (köşeli parantezsiz düz metin) kusurdur.
_SDH_KIND = (
    ('bracket', re.compile(r"\[[^\[\]]+\]")),
    ('paren', re.compile(r"\([^\(\)]+\)")),
    ('music', re.compile(r"[♪♫]")),
    ('speaker', re.compile(r"^\s*[A-ZÇĞİÖŞÜ]{2,}\s*:")),
)
_SPEAKER_TARGET = re.compile(r"^\s*\S{1,20}:")


def _sdh_issue(source, translated):
    """Kaynak parçadaki SDH işaret türlerinin hedef parçada olup olmadığını denetle."""
    source = str(source or '')
    translated = str(translated or '')
    for kind, pattern in _SDH_KIND:
        if not pattern.search(source):
            continue
        if kind == 'speaker':
            if not _SPEAKER_TARGET.match(translated):
                return 'speaker'
        elif not pattern.search(translated):
            return kind
    return ""


def _edit_distance(a, b):
    """Kısa adlar için Levenshtein (özel-ad transliterasyonu kabulünde)."""
    if len(a) < len(b):
        a, b = b, a
    previous = list(range(len(b) + 1))
    for i, char_a in enumerate(a, 1):
        current = [i]
        for j, char_b in enumerate(b, 1):
            current.append(min(previous[j] + 1, current[-1] + 1,
                               previous[j - 1] + (char_a != char_b)))
        previous = current
    return previous[-1]


_NAME_INFLECTED = re.compile(r"([A-Za-zÇĞİÖŞÜçğıöşüΑ-Ωα-ωА-Яа-я][\w\-]*)['’]([a-zçğıöşü]{1,6})\b")


def _common_prefix_len(a, b):
    limit = min(len(a), len(b))
    index = 0
    while index < limit and a[index].lower() == b[index].lower():
        index += 1
    return index


_NAME_CAPITALIZED = re.compile(r"\b[A-ZÇĞİÖŞÜ][\wçğıöşü\-]+")


def _name_preserved(name, translated):
    """Özel adın hedef parçada yazımıyla veya çekimli yerel biçimiyle bulunması.

    Tam eşleşme en hızlı yoldur; 'Lizbon'dan' gibi Türkçe ekli yerelleştirmede
    kök + 'ek biçiminde aranır (ilk iki harf + ≤2 edit mesafesi). Unvan çekimi
    gibi apostrofsuz biçimler ('Majesty'→'Majesteleri') büyük harfli hedef
    tokenında ≥%70 ortak önekle kabul edilir. Çıplak bulanık eşleşme kasıtlı
    yok: 'Larson' gibi ad-bozması kusurlar yakalansın diye.
    """
    translated = str(translated or '')
    if name in translated:
        return True
    head = name[:2].lower()
    for match in _NAME_INFLECTED.finditer(translated):
        stem = match.group(1)
        if len(stem) >= 3 and stem[:2].lower() == head \
                and _edit_distance(stem.lower(), name.lower()) <= 2:
            return True
    threshold = math.ceil(len(name) * 0.7)
    for match in _NAME_CAPITALIZED.finditer(translated):
        token = match.group(0)
        if len(token) >= len(name) \
                and _common_prefix_len(token, name) >= threshold:
            return True
    return False


def _proper_names(text):
    """Cümle başında OLMAYAN büyük harfli tokenlar — özel ad adayı.

    Cümle-ilk tokenı, kısaltmalar (Dr., Mr.), gün/ay adları ve satır başı
    SDH/konuşmacı işaretinden hemen sonra gelen ilk gerçek kelime atlanır.
    """
    text = normalized_text(text)
    prefix = _LEADING_MARKERS.match(text)
    body = text[prefix.end():] if prefix else text
    words = body.split()
    names = []
    for index, word in enumerate(words):
        candidate = word.strip("\"'“”‘’([{«")
        if not _NAME_TOKEN.match(candidate) or not candidate[0].isupper():
            continue
        lowered = candidate.lower().rstrip(".")
        if lowered in ABBREVIATIONS or lowered in _WEEKDAY_MONTH:
            continue
        sentence_initial = index == 0 or sentence_ended(" ".join(words[:index]))
        if not sentence_initial and len(candidate.rstrip(".")) >= 2:
            names.append(candidate.rstrip("."))
    return names


def part_anchor_issue(source_parts, translated_parts, target_lang="tr"):
    """Sayı/para/birim/tarih/SDH/özel adın kaynak ID'sinden başka cue'ya kaymasını yakala.

    Model gruba bütün cümle kurarken bilgiyi doğal yerleşim için başka ID'ye
    taşıyabilir; altyazıda bu, bilginin konuşma anından kopması demektir.
    Yalnızca yapısal işaretler denetlenir — anlam serbest kalmalı; SDH içeriği
    ve özel ad yerelleşebilir, işaret türü ve ad kökü korunur.
    """
    for index, (source, translated) in enumerate(zip(source_parts, translated_parts)):
        for token in _number_tokens(str(source)):
            if not _number_preserved(token, str(translated), target_lang):
                return f"sayi_kaydi:{index}"
        for issue, patterns in (
                ('currency', _CURRENCY_PATTERNS),
                ('unit', _UNIT_PATTERNS),
                ('date', _MONTH_PATTERNS)):
            if not _semantic_markers(source, patterns).issubset(
                    _semantic_markers(translated, patterns)):
                return f"{issue}_kaydi:{index}"
        sdh_kind = _sdh_issue(source, translated)
        if sdh_kind:
            return f"sdh_kaydi:{index}:{sdh_kind}"
        for name in _proper_names(str(source)):
            if not _name_preserved(name, str(translated)):
                return f"ozel_ad_kaydi:{index}"
    return ""


def insert_sentence_breaks(text):
    """Cue içinde ikinci cümle varsa araya gerçek satır sonu koy.

    'Bekle. Emin misin' gibi tek satıra yapışan ikili cümlelerde ikinci cümle
    yeni görsel satırdan başlar; '...Dr. Lawson' gibi kısaltmalar bölünmez.
    Dosya yazımındaki wrap_text de aynı kuralı uygular — buradaki ekleme
    canlı panel/önizleme metninin de aynı davranması içindir.
    """
    text = normalized_text(text)
    out = []
    cursor = 0
    for match in _END_RUN.finditer(text):
        end = match.end()
        if _numeric_separator(text, match):
            continue
        if not normalized_text(text[end:]):
            continue
        if sentence_ended(text[:end]):
            out.append(text[cursor:end] + "\n")
            cursor = end
            while cursor < len(text) and text[cursor] in " \t\n":
                cursor += 1
    if not out:
        return text
    out.append(text[cursor:])
    return "".join(out)


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


_NUMBER_TOKEN = re.compile(r'(?<![\w])(?:\d{1,3}(?:[.,]\d{3})+(?:[.,]\d+)?|\d+(?:[.,]\d+)?)(?:%)?(?![\w])')
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
        if '.' in token and ',' in token:
            decimal = '.' if token.rfind('.') > token.rfind(',') else ','
            grouping = ',' if decimal == '.' else '.'
            return token.replace(grouping, '').replace(decimal, '.')
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


_TR_NUMBER_WORDS = tuple(
    word for word in _TR_ONES + _TR_TENS + ('yüz', 'bin', 'milyon', 'milyar',
                                            'buçuk', 'virgül') if word)
_TR_NUMBER_CONT = re.compile(
    r'^\s+(?:' + '|'.join(sorted(_TR_NUMBER_WORDS, key=len, reverse=True)) + r')\b', re.I)


def _turkish_number_phrase_match(translated, phrase):
    suffix = r"(?:['’]?(?:[ıiuü](?:n[ıiuü])?|[dt][ae]n?|[ea]|[ıiuü]n))?"
    text = str(translated or '')
    for match in re.finditer(r'(?<!\w)' + re.escape(phrase).replace(r'\ ', r'\s+')
                             + suffix + r'(?!\w)', text, re.I):
        # A following number word may change the value of the matched phrase.
        if not _TR_NUMBER_CONT.match(text[match.end():]):
            return match
    return None


def _number_preserved(token, translated, target_lang):
    if token in _number_tokens(translated):
        return True
    if str(target_lang or '').lower().split('-')[0] != 'tr':
        return False
    try:
        value = float(token)
    except ValueError:
        return False
    # Turkish subtitle style may spell an exact source quantity as a scaled
    # expression (10000 -> 10 bin). A changed coefficient must still fail.
    for coefficient, scale in re.findall(
            r'(?<!\d)(\d+(?:[.,]\d+)?)\s+(bin|milyon|milyar)(?!\w)',
            translated, re.I):
        multiplier = {'bin': 1000, 'milyon': 1000000, 'milyar': 1000000000}[scale.lower()]
        if float(coefficient.replace(',', '.')) * multiplier == value:
            return True
    words = (_turkish_integer_words(int(value)) if value.is_integer()
             else f'{_turkish_integer_words(int(value))} buçuk'
             if value >= 0 and value % 1 == 0.5 else '')
    if not words:
        return False
    return bool(_turkish_number_phrase_match(translated, words))


def translation_meaning_issues(source_text, translated_text, target_lang='tr'):
    """Bariz sayı/olumsuzluk kaybını anlamsal kalite kapısı olarak bildirir.

    Bu bir dilbilgisi puanı değildir; yalnızca güvenilir biçimde korunması
    gereken küçük ama kritik işaretleri denetler. Sonuç kodları yeniden deneme,
    önbellek geçersizleştirme ve raporlama için kullanılır.
    """
    source = normalized_text(source_text)
    translated = normalized_text(translated_text)
    issues = []
    source_numbers_text, translated_numbers_text = source, translated
    if str(target_lang or '').lower().split('-')[0] == 'tr':
        # 5:30 and 5.30 are the same clock time in these subtitles. Compare
        # whole clock expressions so a changed minute cannot pass as two
        # independently preserved number tokens.
        clocks = list(re.finditer(r'(?<!\d)(\d{1,2}):([0-5]\d)(?!\d)', source))
        for clock in clocks:
            hour, minute = int(clock.group(1)), clock.group(2)
            target_clock = re.search(
                rf'(?<!\d)0?{hour}[:.]{minute}(?!\d)', translated_numbers_text)
            if target_clock:
                translated_numbers_text = (
                    translated_numbers_text[:target_clock.start()] + ' '
                    + translated_numbers_text[target_clock.end():])
            elif minute == '30' and (word_match := _turkish_number_phrase_match(
                    translated_numbers_text, f'{_turkish_integer_words(hour)} buçuk')):
                translated_numbers_text = (
                    translated_numbers_text[:word_match.start()] + ' '
                    + translated_numbers_text[word_match.end():])
            else:
                issues.append('number_mismatch')
        source_numbers_text = re.sub(
            r'(?<!\d)\d{1,2}:[0-5]\d(?!\d)', ' ', source_numbers_text)
    source_numbers = _number_tokens(source_numbers_text)
    if source_numbers:
        missing = [token for token in source_numbers
                   if not _number_preserved(token, translated_numbers_text, target_lang)]
        if missing and 'number_mismatch' not in issues:
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
    # Aynı cue içinde iki cümle kalıyorsa ikinci cümle gerçek satır sonundan
    # başlar ("Cumle1. Cumle2" tek satıra yapışmaz). Boşluk-normalize eşleşme
    # \n'yi etkilemez; önbellek/refine/canlı panel aynı değeri paylaşır.
    return {"text": normalized_text(whole),
            "parts": [insert_sentence_breaks(part) for part in parts]}


def sentence_reply_issue(data, ids):
    """Bir cümle yanıtının neden reddedildiğini metni sızdırmadan açıkla."""
    if not isinstance(data, dict):
        return "kok_nesne_degil"
    items = data.get('items', data)
    wholes = data.get('sentences', {})
    if not isinstance(items, dict):
        return "items_nesne_degil"
    if not isinstance(wholes, dict):
        return "sentences_nesne_degil"
    parts = [items.get(str(index)) for index in ids]
    missing = sum(part is None for part in parts)
    if missing:
        return f"eksik_part:{missing}"
    if any(not isinstance(part, str) or not normalized_text(part) for part in parts):
        return "bos_veya_gecersiz_part"
    whole = wholes.get(str(ids[0]))
    if len(ids) == 1 and whole is None:
        whole = parts[0]
    if whole is None:
        return "eksik_tam_cumle"
    if not isinstance(whole, str) or not normalized_text(whole):
        return "bos_veya_gecersiz_tam_cumle"
    if len(whole) > 12000:
        return "tam_cumle_cok_uzun"
    if not sentence_parts_match(whole, parts):
        return "partlar_tam_cumleyi_olusturmuyor"
    return ""


def accept_sentence_reply(data, ids):
    """Çok bloklu grup ya bütünüyle kabul edilir ya hiç uygulanmaz.

    Eski düz ID→metin yanıtları yalnız bağımsız tek bloklarda uyumluluk için
    kabul edilir. Çok bloklu grupta ayrı tam çeviri kanıtı zorunludur.
    """
    if sentence_reply_issue(data, ids):
        return None
    items = data.get('items', data)
    wholes = data.get('sentences', {})
    parts = [items.get(str(index)) for index in ids]
    whole = wholes.get(str(ids[0]))
    if len(ids) == 1 and whole is None:
        whole = parts[0]
    return validate_sentence_parts(whole, parts, len(ids))
