"""Conservative Turkish speech text and audio finishing; no model dependency."""
import re
import numpy as np

SPOKEN_TEXT_VERSION = 'tr-spoken-v2-numbers-currency'

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


def spoken_text(text):
    """Expand only unambiguous TR forms; leave dates, clocks, IDs and suffixes alone."""
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
    text = re.sub(r'%\s*(\d+(?:[.,]\d+)*)|(\d+(?:[.,]\d+)*)\s*%',
                  lambda m: 'yüzde ' + (m[1] or m[2]), text)
    # Rates are spoken as a unit pair; a bare '/h' or '/s' would be read as letters.
    units = {'km/h':'kilometre bölü saat', 'm/s':'metre bölü saniye', 'km':'kilometre', 'kg':'kilogram',
             'cm':'santimetre', 'mm':'milimetre', 'm':'metre', '°C':'derece Celsius'}
    text = re.sub(r'(?<=\d)\s*(km/h|m/s|km|kg|cm|mm|m|°C)(?!\w)', lambda m: ' ' + units[m[1]], text)
    # A currency symbol is not reliably read by the engine; the spoken form is
    # always 'amount + currency name' in Turkish, whichever side the symbol is on.
    currency = {'$':'dolar', '€':'euro', '£':'sterlin', '₺':'lira'}
    text = re.sub(r'([$€£₺])\s?(\d+(?:[.,]\d+)*)|(\d+(?:[.,]\d+)*)\s?([$€£₺])',
                  lambda m: f"{m[2] or m[3]} {currency[m[1] or m[4]]}", text)
    # Avoid interpreting punctuation in a date/clock/version/phone as decimal.
    # A number that ends a sentence or clause ('Toplam 42.', 'yaşı 25, boyu 180')
    # is still a number: sentence punctuation only blocks it when a digit/word
    # follows it, and a mid-text period stays ambiguous with a Turkish ordinal
    # ('3. sınıf', '2. Dünya Savaşı'), so only a final period is accepted.
    pattern = (r'(?<![\w\d.,:/+\-])\d{1,9}(?:,\d{1,3})?'
               r'(?![\w/\-]|\.(?![\s"”’»)\]]*$)|[,:;](?=\w)|[\'’]\w)')
    def number(match):
        value = match[0]
        if value.startswith('0') and len(value.split(',')[0]) > 1:
            return value
        pieces = value.split(',')
        return integer_words(pieces[0]) + (' virgül ' + ' '.join('sıfır' if n == '0' else _ONES[int(n)] for n in pieces[1]) if len(pieces) > 1 else '')
    return re.sub(pattern, number, text)


def finish_audio(audio, sr, preserve_dynamics=False):
    """Remove only near-digital edge silence, retain 60 ms, bound gain to 3 dB."""
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
    rms = float(np.sqrt(np.mean(audible**2))) if len(audible) else 0
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
    if sr <= 0:
        raise ValueError('Invalid sample rate.')
    tail = preceding_text.rstrip().rstrip('"\u201d\u2019\u00bb)]')
    target = .24 if tail.endswith(('?', '!')) else .22 if tail.endswith('.') else .18 if tail.endswith((';', ':')) else .12 if tail.endswith(',') else .08
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
    wav = np.asarray(audio, dtype=np.float32)
    step = max(1, round(sr*.02))
    levels = np.array([np.sqrt(np.mean(wav[i:i+step]**2)) for i in range(0,len(wav),step)])
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
