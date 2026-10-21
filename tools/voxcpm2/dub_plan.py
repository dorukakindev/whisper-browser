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

TAG_RE = re.compile(r"</?(?:b|i|u|s|strong|em|font|span|small|big|sub|sup)(?=[\s/>])[^>]*>|\{\\[^}]*\}", re.I)
TIME_RE = re.compile(
    r"^[ \t]*(\d+):([0-5]\d):([0-5]\d)[,.](\d{1,3})[ \t]*-->[ \t]*"
    r"(\d+):([0-5]\d):([0-5]\d)[,.](\d{1,3})(?=[ \t\n]|$)", re.MULTILINE)


MAX_SOURCE_BYTES = 2_000_000
MAX_GROUPS = 5000


def read_source_bytes(path):
    with Path(path).open('rb') as handle:
        data = handle.read(MAX_SOURCE_BYTES + 1)
    if len(data) > MAX_SOURCE_BYTES:
        raise ValueError('SRT cok buyuk.')
    return data


def parse_srt(path, source_bytes=None):
    """SRT -> [(start_ms, end_ms, temiz_metin)]."""
    data = read_source_bytes(path) if source_bytes is None else source_bytes
    if len(data) > MAX_SOURCE_BYTES:
        raise ValueError('SRT cok buyuk.')
    text = decode_subtitle_bytes(data)[0].replace("\r\n", "\n").replace("\r", "\n")
    # SRT separators may contain spaces/tabs from subtitle editors.
    text = re.sub(r'(?m)^[ \t]+$', '', text)
    cues = []
    timings = list(TIME_RE.finditer(text))
    for index, match in enumerate(timings):
        fields = match.groups()
        h1, m1, s1, ms1, h2, m2, s2, ms2 = (
            int(g.ljust(3, '0')) if i in (3, 7) else int(g) for i, g in enumerate(fields))
        start = ((h1 * 60 + m1) * 60 + s1) * 1000 + ms1
        end = ((h2 * 60 + m2) * 60 + s2) * 1000 + ms2
        line_end = text.find("\n", match.end())
        block_end = text.find("\n\n", match.end())
        if line_end < 0:
            line_end = len(text)
        if block_end < 0:
            block_end = len(text)
        if index + 1 < len(timings) and timings[index + 1].start() < block_end:
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
        body = re.sub(r"\s+", " ", body).strip()
        if body and end >= start:
            cues.append((start, max(start + 1, end), body))
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
    selected, source_ids = [], []
    for i, (s, e, text) in enumerate(cues):
        if start is not None:
            if e <= start * 1000 or s >= end * 1000:
                continue
            s, e = max(s, round(start * 1000)), min(e, round(end * 1000))
        selected.append((s, e, text)); source_ids.append(i + 1)
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


def grouping_options(mode):
    if mode not in ('cumle', 'satir', 'akici'):
        raise ValueError('Gecersiz gruplama modu.')
    return {'mode': mode, 'max_chars': 550 if mode == 'akici' else 250,
            'max_seconds': 24 if mode == 'akici' else 12, 'max_gap_ms': 600}


def plan(path, start=None, end=None, grouping='cumle'):
    source = Path(path)
    source_bytes = read_source_bytes(source)
    groups = make_groups(parse_srt(source, source_bytes), start, end, **grouping_options(grouping))
    if not groups or len(groups) > 5000:
        raise ValueError('SRT grup sayisi gecersiz.')
    for g in groups:
        g['key'] = ','.join(map(str, g['source_ids']))
        g['seconds'] = (g['end'] - g['start']) / 1000
    return {'sourceHash': hashlib.sha256(source_bytes).hexdigest(), 'groups': groups}

if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('source')
    parser.add_argument('start', nargs='?', type=float)
    parser.add_argument('end', nargs='?', type=float)
    parser.add_argument('--grouping', choices=('cumle', 'satir', 'akici'), default='cumle')
    args = parser.parse_args()
    print(json.dumps(plan(args.source, args.start, args.end, args.grouping), ensure_ascii=True))
