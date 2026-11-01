"""Conservative Turkish speech text and audio finishing; no model dependency."""
import re
import numpy as np

SPOKEN_TEXT_VERSION = 'tr-spoken-v9-explicit-inflections'

_ONES = ('', 'bir', 'iki', 'üç', 'dört', 'beş', 'altı', 'yedi', 'sekiz', 'dokuz')
_TENS = ('', 'on', 'yirmi', 'otuz', 'kırk', 'elli', 'altmış', 'yetmiş', 'seksen', 'doksan')

def integer_words(number):
    n = int(number)
    if not 0 <= n < 1_000_000_000:
        return number
    if n == 0:
        return 'sıfır'
    def small(x):
        return ' '.join(p for p in ((_ONES[x//100] + ' ' if x//100 > 1 else '') + 'yüz' if x >= 100 else '', _TENS[x%100//10], _ONES[x%10]) if p)
    parts = []
    for size, name in ((1_000_000, 'milyon'), (1000, 'bin')):
        q, n = divmod(n, size)
        if q:
            parts.append((small(q) + ' ' if q != 1 or size != 1000 else '') + name)
    if n:
        parts.append(small(n))
    return ' '.join(parts)


def decimal_evidence(text):
    """Unambiguous dotted quantities; never infer dates, IDs or clock notation."""
    units = r'kilometre|kilogram|metre|gram|litre|mililitre|santimetre|milimetre|dolar|euro|lira|sterlin|km|kg|cm|mm|ml|mg|m|g|l'
    rows = []
    for match in re.finditer(r"(?<![\w.,:/])\d+\.\d+(?![\w.,:/]|['’]\w)", text):
        before, after = text[max(0,match.start()-36):match.start()], text[match.end():match.end()+40]
        if re.search(r'\b(?:saat|sürüm|versiyon|kod|kimlik|id|version)\s*:?\s*$', before, re.I):
            continue
        integer, fraction = match[0].split('.')
        if len(fraction)==3:
            continue  # established Turkish thousands spelling takes precedence
        context = ('unit' if re.match(r'\s*(?:'+units+r')(?!\w)',after,re.I)
                   else 'currency_or_percent' if re.match(r'\s*[%$€£₺]',after) or re.search(r'[%$€£₺]\s*$',before)
                   else None)
        if context:
            rows.append({'start':match.start(),'end':match.end(),'number':match[0], 'decimal_separator':'dot','decimal_context':context})
    return rows


def normalize_decimal_quantities(text):
    for row in reversed(decimal_evidence(text)):
        text=text[:row['start']]+row['number'].replace('.',',')+text[row['end']:]
    return text


def _case_suffixes(word):
    """Valid case endings of a spoken unit or clock value, without guessing."""
    vowel = next(c for c in reversed(word) if c in 'aeıioöuü')
    low = 'a' if vowel in 'aıou' else 'e'
    high = {'a':'ı', 'ı':'ı', 'e':'i', 'i':'i', 'o':'u', 'u':'u', 'ö':'ü', 'ü':'ü'}[vowel]
    voiced = 't' if word[-1] in 'fstkçşhp' else 'd'
    buffer = word[-1] in 'aeıioöuü'
    return {voiced+low, voiced+low+'n', ('y' if buffer else '')+low,
            ('y' if buffer else '')+high, ('n' if buffer else '')+high+'n'}


def _explicit_readings(text):
    # Full ordinal suffixes and the conventional shortened suffix after vowels
    # carry meaning that a bare period (3. sınıf, list numbering) does not.
    def ordinal(match):
        cardinal = integer_words(match[1])
        last = cardinal.split()[-1]
        ending = {'bir':'inci', 'iki':'nci', 'üç':'üncü', 'dört':'üncü',
                  'beş':'inci', 'altı':'ncı', 'yedi':'nci', 'sekiz':'inci',
                  'dokuz':'uncu', 'on':'uncu', 'yirmi':'nci', 'otuz':'uncu',
                  'kırk':'ıncı', 'elli':'nci', 'altmış':'ıncı', 'yetmiş':'inci',
                  'seksen':'inci', 'doksan':'ıncı', 'yüz':'üncü', 'bin':'inci',
                  'milyon':'uncu'}[last]
        full = ('i' if last[-1] in 'ei' else 'ı' if last[-1] in 'aı' else
                'u' if last[-1] in 'ou' else 'ü') + ending if ending.startswith('n') else ending
        if match[2] not in {ending, full}:
            return match[0]
        if last == 'dört':
            cardinal = cardinal[:-1] + 'd'
        return cardinal + ending
    text = re.sub(r"(?<![\w.,:/+\-])([1-9]\d{0,8})['’](inci|ıncı|uncu|üncü|nci|ncı|ncu|ncü)(?!\w)",
                  ordinal, text)

    # Only an explicit 'saat' label disambiguates a clock from scores or IDs.
    def clock(match):
        hour, minute = int(match[2]), int(match[3])
        if hour > 23 or minute > 59:
            return match[0]
        spoken = integer_words(str(hour))
        if minute:
            spoken += ' ' + ('sıfır ' if minute < 10 and hour else '') + integer_words(str(minute))
        suffix = match[4]
        if suffix and suffix not in _case_suffixes(spoken):
            return match[0]
        return match[1] + spoken + (suffix or '')
    text = re.sub(r"(\bsaat\s+)(\d{1,2}):(\d{2})(?:['’]([a-zçğıöşü]+))?"
                  r"(?![\w:/]|[.,](?=\d)|['’]\w)", clock, text, flags=re.I)
    return text


def spoken_text(text):
    """Expand explicit TR quantities; preserve ambiguous dates, clocks and IDs."""
    text = _explicit_readings(text)
    text = normalize_decimal_quantities(text)
    # Dotted quantities are Turkish thousands only with explicit quantity
    # context. Keep version/ID/date/clock/phone spellings unchanged otherwise.
    quantity_units = (r'kişi|insan|öğrenci|çocuk|yolcu|izleyici|çalışan|işçi|asker|'
                      r'adet|tane|oy|kez|defa|dolar|euro|lira|sterlin|tl|'
                      r'kilometre|kilogram|metre|gram|litre|km|kg|cm|mm|ml|mg|°C|m|g|l')
    def grouped_quantity(match):
        # Leading zero is not a valid Turkish thousands group. It may be a
        # decimal/identifier even when followed by a unit; retain its dots.
        unsigned = match[0].lstrip('+-− ').split(',')[0]
        if unsigned.startswith('0'):
            return match[0]
        before = text[max(0, match.start()-48):match.start()]
        after = text[match.end():match.end()+64]
        explicit_unit = re.match(r'\s*(?:' + quantity_units + r')(?!\w)|\s*[$€£₺%]', after, re.I)
        explicit_total = re.search(r'(?<!\w)(?:toplam|sayısı|tutarı)\s*:?\s*$', before, re.I)
        currency_prefix = re.search(r'[$€£₺%]\s*$', before)
        if (explicit_unit or explicit_total or currency_prefix) and len(re.sub(r'[^0-9]', '', match[0].split(',')[0])) <= 9:
            return match[0].replace('.', '')
        return match[0]
    text = re.sub(r"(?<![\w.,:/+\-−'’])(?:[-−+]\s*)?\d{1,3}(?:\.\d{3})+(?:,\d{1,3})?"
                  r"(?![\w.,:/+\-−]|['’]\w)", grouped_quantity, text)
    # Move a signed, standalone prefix amount before its currency symbol so
    # the existing sign and currency passes can both read it. Do not rewrite IDs.
    text = re.sub(r"(?<![\w.,:/+\-−])([$€£₺])\s*([-−+])\s*(\d+(?:,\d+)?)"
                  r"(?![\w/+\-−]|[.,:](?=\d)|['’]\w)",
                  lambda m: m[2] + m[3] + ' ' + m[1], text)
    text = re.sub(r"(?<![\w.,:/+\-−])%\s*([-−+])\s*(\d+(?:,\d+)?)"
                  r"(?![\w/+\-−]|[.,:](?=\d)|['’]\w)",
                  lambda m: 'yüzde ' + ('eksi ' if m[1] in '-−' else 'artı ') + m[2], text)
    # Unary signs are speech, whereas dates, ranges and identifiers are not.
    text = re.sub(r'(?<![\w.,:/+\-−])([-−+])\s*(\d+(?:,\d+)?)'
                  r'(?![\w/+\-−]|[.,:](?=\d)|[’\']\w)',
                  lambda m: ('eksi ' if m[1] in '-−' else 'artı ') + m[2], text)
    text = re.sub(r'\bDr\.(?=\s+[A-ZÇĞİÖŞÜ])', 'Doktor', text)
    text = re.sub(r'\bProf\.(?=\s+[A-ZÇĞİÖŞÜ])', 'Profesör', text)
    text = re.sub(r'\bDoç\.(?=\s+[A-ZÇĞİÖŞÜ])', 'Doçent', text)
    text = re.sub(r'\bSn\.(?=\s+[A-ZÇĞİÖŞÜ])', 'Sayın', text)
    # 'vs.' is deliberately absent: 'vesaire' in Turkish text, 'versus' in translated content.
    words = {'vb': 've benzeri', 'bkz': 'bakınız', 'örn': 'örneğin'}
    def abbreviation(match):
        spoken = words[match[1].casefold()]
        if match[1][0].isupper():
            spoken = spoken[0].upper() + spoken[1:]
        # Keep the full stop only when it also ends the sentence.
        following = match.string[match.end():]
        final = re.match(r'[\s"”’»)\]]*$', following) or (
            match[1].casefold() == 'vb' and re.match(r'\s+[A-ZÇĞİÖŞÜ]', following))
        return spoken + ('.' if final else '')
    text = re.sub(r'(?<![\w.])(vb|bkz|örn)\.(?!\w)', abbreviation, text, flags=re.I)
    text = re.sub(r'(?<![\w.,:/])%\s*(\d+(?:[.,]\d+)*)(?!\w|[.,:/](?=\d))|(?<![\w.,:/])(\d+(?:[.,]\d+)*)\s*%(?!\w)',
                  lambda m: 'yüzde ' + (m[1] or m[2]), text)
    # Rates are spoken as a unit pair; a bare '/h' or '/s' would be read as letters.
    units = {'km/h':'kilometre bölü saat', 'm/s':'metre bölü saniye', 'km':'kilometre', 'kg':'kilogram',
             'cm':'santimetre', 'mm':'milimetre', 'm':'metre', '°C':'derece Celsius'}
    def unit(match):
        word, suffix = units[match[1]], match[2]
        if suffix:
            if match[1] == '°C' or suffix not in _case_suffixes(word):
                return match[0]
            word += suffix
        return ' ' + word
    text = re.sub(r"(?<=\d)\s*(km/h|m/s|km|kg|cm|mm|m|°C)(?:['’]([a-zçğıöşü]+))?(?![\w/]|['’]\w)", unit, text)
    # A currency symbol is not reliably read by the engine; the spoken form is
    # always 'amount + currency name' in Turkish, whichever side the symbol is on.
    currency = {'$':'dolar', '€':'euro', '£':'sterlin', '₺':'lira'}
    text = re.sub(r'(?<![\w.,:/])([$€£₺])\s?(\d+(?:[.,]\d+)*)(?![\w]|[.,:/](?=\d))|(?<![\w.,:/])(\d+(?:[.,]\d+)*)\s?([$€£₺])(?!\w)',
                  lambda m: f"{m[2] or m[3]} {currency[m[1] or m[4]]}", text)
    # Avoid interpreting punctuation in a date/clock/version/phone as decimal.
    # A number that ends a sentence or clause ('Toplam 42.', 'yaşı 25, boyu 180')
    # is still a number: sentence punctuation only blocks it when a digit/word
    # follows it, and a mid-text period stays ambiguous with a Turkish ordinal
    # ('3. sınıf', '2. Dünya Savaşı'), so only a final period is accepted.
    pattern = (r'(?<![\w\d.,:/+\-$€£₺%])\d{1,9}(?:,\d{1,3})?'
               r'(?![\w/\-]|[$€£₺%](?=\w)|\.(?![\s"”’»)\]]*$)|[,:;](?=\w)|[\'’]\w)')
    def number(match):
        value = match[0]
        if value.startswith('0') and len(value.split(',')[0]) > 1:
            return value
        pieces = value.split(',')
        return integer_words(pieces[0]) + (' virgül ' + ' '.join('sıfır' if n == '0' else _ONES[int(n)] for n in pieces[1]) if len(pieces) > 1 else '')
    return re.sub(pattern, number, text)


def _sample_rate(sr):
    if (isinstance(sr, (bool, np.bool_))
            or not isinstance(sr, (int, float, np.integer, np.floating))
            or not 8000 <= sr <= 384000 or not np.isfinite(sr) or sr != int(sr)):
        raise ValueError('Invalid sample rate.')
    return int(sr)


def finish_audio(audio, sr, preserve_dynamics=False):
    """Remove only near-digital edge silence, retain 60 ms, bound gain to 3 dB."""
    sr = _sample_rate(sr)
    wav = np.asarray(audio, dtype=np.float32).copy()
    if wav.ndim != 1 or sr <= 0 or not len(wav) or not np.isfinite(wav).all():
        raise ValueError('Invalid generated speech.')
    peak = float(np.max(np.abs(wav)))
    active = np.flatnonzero(np.abs(wav) > max(.0001, peak * .001))
    left, right = 0, len(wav)
    if len(active):
        pad = round(sr * .06)
        left, right = max(0, int(active[0])-pad), min(len(wav), int(active[-1])+pad+1)
    wav = wav[left:right].copy()
    # Measure active samples; silence should not cause an excessive boost.
    levels = np.abs(wav)
    audible = wav[levels > max(.002, peak * .025)]
    rms = float(np.sqrt(np.mean(audible.astype(np.float64)**2))) if len(audible) else 0
    gain = 1 if preserve_dynamics else (min(10**(3/20), max(10**(-3/20), .1/rms)) if rms else 1)
    gain = min(gain, .97/max(peak, .000001))
    wav *= gain
    fade = min(round(sr * .003), len(wav)//2)
    if fade:
        ramp = np.linspace(0, 1, fade, dtype=np.float32)
        wav[:fade] *= ramp
        wav[-fade:] *= ramp[::-1]
    return wav, {'trim_start_seconds':left/sr, 'trim_end_seconds':(len(audio)-right)/sr, 'gain_db':round(20*np.log10(gain),3)}


def join_pause_frames(previous, following, sr, preceding_text):
    """Add only missing quiet padding; never overlap speech or remove breaths.

    These small punctuation-aware targets are joining defaults, not a model of
    human prosody. Existing longer natural pauses are deliberately retained.
    """
    sr = _sample_rate(sr)
    tail = preceding_text.rstrip(' \t\r\n\"\u201d\u2019\u00bb\u203a\u300d\u300f)]}')
    target = .24 if tail.endswith(('?', '!')) else .22 if tail.endswith(('.', '\u2026')) else .18 if tail.endswith((';', ':')) else .12 if tail.endswith(',') else .08
    def quiet_edge(wav, end):
        wav = np.asarray(wav, dtype=np.float32)
        if wav.ndim != 1 or not len(wav) or not np.isfinite(wav).all():
            raise ValueError('Invalid speech join.')
        edge = wav[-round(sr*.5):] if end else wav[:round(sr*.5)]
        active = np.flatnonzero(np.abs(edge) > max(.0001, float(np.max(np.abs(wav)))*.001))
        return (len(edge)-1-int(active[-1]) if end else int(active[0])) if len(active) else len(edge)
    existing = quiet_edge(previous, True) + quiet_edge(following, False)
    return max(0, round(sr*target)-existing)


def active_ranges(audio, sr, offset=0):
    """Bounded energy-based speech activity; music/speaker classification is not claimed."""
    sr = _sample_rate(sr)
    wav = np.asarray(audio, dtype=np.float32)
    if wav.ndim != 1 or not np.isfinite(wav).all() or isinstance(offset, (bool, np.bool_)) or not isinstance(offset, (int, float, np.integer, np.floating)) or not np.isfinite(offset) or offset < 0:
        raise ValueError('Invalid speech activity input.')
    step = max(1, round(sr*.02))
    levels = np.array([np.sqrt(np.mean(wav[i:i+step].astype(np.float64)**2)) for i in range(0,len(wav),step)])
    if not len(levels):
        return []
    active = np.flatnonzero(levels > max(.002, float(levels.max())*.025))
    ranges = []
    for i in active:
        start, stop = max(0, i*step/sr-.04), min(len(wav)/sr, (i+1)*step/sr+.08)
        if ranges and start-ranges[-1][1] <= .12:
            ranges[-1][1] = stop
        else:
            ranges.append([start,stop])
    if len(ranges)>100:
        ranges = ranges[:99] + [[ranges[99][0], ranges[-1][1]]]
    return [[round(a+offset,6),round(b+offset,6)] for a,b in ranges]
