"""Model-free SRT plan and separate reviewed dubbing text."""
import hashlib
import html
import json
import math
import re
import sys
from pathlib import Path
from dub_timing import sentence_plan
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'backend'))
from subtitle_text import decode_subtitle_bytes
from subtitle_sdh import is_structural_sdh_cue, strip_sdh_descriptors

TAG_RE = re.compile(r"</?(?:b|i|u|s|strong|em|font|span|small|big|sub|sup)(?=[\s/>])[^>]*>|\{\\[^}]*\}", re.I)
TIME_RE = re.compile(
    r"^[ \t]*(\d+):([0-5]\d):([0-5]\d)[,.](\d{1,3})[ \t]*-->[ \t]*"
    r"(\d+):([0-5]\d):([0-5]\d)[,.](\d{1,3})(?=[ \t\n]|$)", re.MULTILINE)


MAX_SOURCE_BYTES = 4_000_000
MAX_GROUPS = 5000
MUSIC_SYMBOLS = re.compile(r'[♪♫♬♩]+')


class SourceCues(list):
    """Keep the old valid-cue ordinal through speech-only filtering.

    Consumers still receive triples; group/edit/prosody identities must use
    these original ordinals, never the filtered list positions.
    """
    def __init__(self):
        super().__init__()
        self.source_ids = []
        self.source_decoding = None


def speech_body(body):
    """Keep what a narrator can say; drop sound and music annotations.

    SDH labels such as [MÜZİK], (alkış), [Müzik çalıyor] or ♪ are not speech and
    must never be read aloud. subtitle_sdh only recognises complete, known
    descriptors, so genuine parenthetical speech is preserved. A cue left with
    nothing pronounceable (no letter or digit) yields an empty body.
    """
    if not body or is_structural_sdh_cue(body):
        return ''
    body = MUSIC_SYMBOLS.sub(' ', strip_sdh_descriptors(body))
    body = re.sub(r'\s+', ' ', body).strip()
    return body if re.search(r'[^\W_]', body) else ''


def read_source_bytes(path):
    with Path(path).open('rb') as handle:
        data = handle.read(MAX_SOURCE_BYTES + 1)
    if len(data) > MAX_SOURCE_BYTES:
        raise ValueError('SRT cok buyuk.')
    return data


def parse_srt(path, source_bytes=None, skipped=None):
    """SRT -> [(start_ms, end_ms, temiz_metin)].

    `skipped`, when a list, receives (start_ms, end_ms) of every cue dropped because
    it only carried a sound/music annotation, so callers can report it.
    """
    data = read_source_bytes(path) if source_bytes is None else source_bytes
    if len(data) > MAX_SOURCE_BYTES:
        raise ValueError('SRT cok buyuk.')
    text, encoding, repaired = decode_subtitle_bytes(data)
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    # SRT separators may contain spaces/tabs from subtitle editors.
    text = re.sub(r'(?m)^[ \t]+$', '', text)
    cues = SourceCues()
    cues.source_decoding={'encoding':'utf-8' if encoding=='utf-8-sig' else 'latin-1' if encoding.startswith('latin-1') else encoding, 'repaired':bool(repaired)}
    source_ordinal = 0
    all_timings = list(TIME_RE.finditer(text))
    valid_starts = {match.start() for match in all_timings}
    timings = []
    for match in all_timings:
        previous_end = max(0, match.start() - 1)
        previous_start = text.rfind('\n', 0, previous_end) + 1
        previous = text[previous_start:previous_end].strip()
        prior_end = max(0, previous_start - 1)
        prior_start = text.rfind('\n', 0, prior_end) + 1
        prior = text[prior_start:prior_end].strip()
        if not timings or not previous or previous.isdigit() or not prior:
            timings.append(match)
    if timings:
        # Only an optional single cue identifier may precede the first timing.
        # Otherwise a malformed opening cue (and its speech) was silently lost
        # because the global regex started at the next valid cue.
        prefix = text[:timings[0].start()].strip()
        if prefix and ('\n' in prefix or '-->' in prefix or '->' in prefix):
            raise ValueError('Invalid SRT opening cue / Geçersiz ilk altyazı satırı; fix the source before dubbing.')
    for candidate in re.finditer(r'(?m)^[ \t]*[+-]?\d+:\d{2}:\d{2}[,.]\d{1,3}[ \t]*-->[^\n]*', text):
        if candidate.start() not in valid_starts:
            line = text.count('\n', 0, candidate.start()) + 1
            raise ValueError(f'Invalid SRT timestamp at line {line} / Gecersiz altyazi zamani; fix the source before dubbing.')

    for index, match in enumerate(timings):
        fields = match.groups()
        h1, m1, s1, ms1, h2, m2, s2, ms2 = (
            int(g.ljust(3, '0')) if i in (3, 7) else int(g) for i, g in enumerate(fields))
        start = ((h1 * 60 + m1) * 60 + s1) * 1000 + ms1
        end = ((h2 * 60 + m2) * 60 + s2) * 1000 + ms2
        # Bound scans to this cue, including compact SRT without blank lines.
        next_start = timings[index + 1].start() if index + 1 < len(timings) else len(text)
        line_end = text.find("\n", match.end(), next_start)
        block_end = text.find("\n\n", match.end(), next_start)
        if line_end < 0:
            line_end = len(text)
        if block_end < 0:
            block_end = next_start
        if index + 1 < len(timings) and timings[index + 1].start() <= block_end:
            block_end = timings[index + 1].start()
            # Recover compact SRT without reading the next cue's index aloud.
            prefix = text[line_end:block_end]
            header_end = max(0, match.start() - 1)
            counter = text[text.rfind('\n', 0, header_end) + 1:header_end].strip()
            following = re.search(r'\n[ \t]*(\d+)[ \t]*\n?$', prefix)
            if counter.isdecimal() and len(counter) <= 10 and following and len(following[1]) <= 10 and int(following[1]) == int(counter) + 1:
                prefix = prefix[:following.start()]
            body = prefix
        else:
            body = text[line_end:block_end]
        # Line-break tags separate words; inline styling must not split them.
        body = re.sub(r'<br\b[^>]*>', ' ', body, flags=re.I)
        body = html.unescape(TAG_RE.sub('', body))
        body = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]', '', body)
        raw_body = re.sub(r"\s+", " ", body).strip()
        if raw_body and end < start:
            raise ValueError(f'SRT cue {index + 1}: end {end} ms < start {start} ms. '
                             'Fix subtitle timing / Altyazi zamanlarini duzeltin; no speech was generated.')
        if raw_body and end >= start:
            source_ordinal += 1
        body = speech_body(raw_body)
        if raw_body and not body and skipped is not None and end >= start:
            skipped.append((start, end))
        if body and end >= start:
            cues.append((start, max(start + 1, end), body))
            cues.source_ids.append(source_ordinal)
    return cues


def apply_edits(groups, document, source_hash):
    if document.get('sourceHash') != source_hash:
        raise ValueError('SRT degisti; dublaj metnini yeniden hazirlayin.')
    edits = document.get('edits', {})
    if set(edits) - {','.join(map(str, g['source_ids'])) for g in groups}:
        print('DUB_WARNING sample_edits_unused', flush=True)
    # A sample uses only the first cues; remaining full-plan edits are ignored.
    for g in groups:
        key = ','.join(map(str, g['source_ids']))
        if key not in edits:
            continue
        value = edits.get(key, g['text'])
        if not isinstance(value, str) or not value.strip() or len(value) > 1000:
            raise ValueError('Gecersiz dublaj metni.')
        g['original_text'] = g['text']
        g['text'] = re.sub(r'\s+', ' ', value).strip()
    return groups

def make_groups(cues, start=None, end=None, limit=0, mode='cumle', max_chars=250,
                max_seconds=12, max_gap_ms=600):
    if (start is None) != (end is None):
        raise ValueError('Baslangic ve bitis birlikte gerekli.')
    if start is not None and (not math.isfinite(start) or not math.isfinite(end) or start < 0 or end <= start):
        raise ValueError('Gecersiz zaman araligi.')
    # Cues and clipped bounds share the same millisecond clock. Testing
    # overlap before rounding can retain a cue that clips to zero length.
    if start is not None:
        start_ms, end_ms = round(start * 1000), round(end * 1000)
        if end_ms <= start_ms:
            raise ValueError('Gecersiz zaman araligi.')
    selected, source_ids = [], []
    previous_start = -1
    for i, (s, e, text) in enumerate(cues):
        if s < previous_start:
            source_id = cues.source_ids[i] if isinstance(cues, SourceCues) else i + 1
            raise ValueError(f'SRT cue {source_id}: timestamps out of order / Zamanlar sirali degil. '
                             'Sort subtitle timing before dubbing; source IDs were not changed.')
        previous_start = s
        if start is not None:
            if e <= start_ms or s >= end_ms:
                continue
            s, e = max(s, start_ms), min(e, end_ms)
        selected.append((s, e, text))
        source_ids.append(cues.source_ids[i] if isinstance(cues, SourceCues) else i + 1)
        if limit and len(selected) >= limit:
            break
    if not selected:
        raise ValueError('Secilen aralikta altyazi yok.')
    groups = sentence_plan(selected, mode, max_chars, max_seconds, max_gap_ms)
    if len(groups) > MAX_GROUPS or any(len(g['text']) > 8000 for g in groups):
        raise ValueError('SRT grup sayisi veya grup metni cok buyuk.')
    for g in groups:
        g['source_ids'] = [source_ids[i - 1] for i in g['source_ids']]
    return groups


def shift_cues(cues, offset):
    """Shift time without renumbering surviving speech/edit identities."""
    result = SourceCues()
    ids = cues.source_ids if isinstance(cues, SourceCues) else range(1, len(cues) + 1)
    for source_id, (start, end, text) in zip(ids, cues):
        if end + offset > 0:
            result.append((max(0, start + offset), end + offset, text))
            result.source_ids.append(source_id)
    return result


def grouping_options(mode):
    if mode not in ('cumle', 'satir', 'akici', 'anlatim'):
        raise ValueError('Gecersiz gruplama modu.')
    return {'mode': mode, 'max_chars': 280 if mode in ('akici', 'anlatim') else 250,
            'max_seconds': 18 if mode in ('akici', 'anlatim') else 12, 'max_gap_ms': 600}


def plan(path, start=None, end=None, grouping='cumle'):
    source = Path(path)
    source_bytes = read_source_bytes(source)
    skipped = []
    cues=parse_srt(source, source_bytes, skipped)
    groups = make_groups(cues, start, end, **grouping_options(grouping))
    if not groups or len(groups) > 5000:
        raise ValueError('SRT grup sayisi gecersiz.')
    for g in groups:
        g['key'] = ','.join(map(str, g['source_ids']))
        g['seconds'] = (g['end'] - g['start']) / 1000
    return {'sourceHash': hashlib.sha256(source_bytes).hexdigest(), 'groups': groups,
            'skipped': len(skipped), 'sourceDecoding': cues.source_decoding}

if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('source')
    parser.add_argument('start', nargs='?', type=float)
    parser.add_argument('end', nargs='?', type=float)
    parser.add_argument('--grouping', choices=('cumle', 'satir', 'akici', 'anlatim'), default='cumle')
    args = parser.parse_args()
    print(json.dumps(plan(args.source, args.start, args.end, args.grouping), ensure_ascii=True))
