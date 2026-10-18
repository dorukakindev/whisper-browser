"""Model-free SRT plan and separate reviewed dubbing text."""
import hashlib
import json
import math
import re
import sys
from pathlib import Path
from dub_timing import sentence_plan

TAG_RE = re.compile(r"<[^>]+>|\{[^}]*\}")
TIME_RE = re.compile(
    r"^[ \t]*(\d+):([0-5]\d):([0-5]\d)[,.](\d{1,3})[ \t]*-->[ \t]*"
    r"(\d+):([0-5]\d):([0-5]\d)[,.](\d{1,3})(?=[ \t\n]|$)", re.MULTILINE)


def parse_srt(path, source_bytes=None):
    """SRT -> [(start_ms, end_ms, temiz_metin)]."""
    data = Path(path).read_bytes() if source_bytes is None else source_bytes
    text = data.decode("utf-8-sig", errors="replace").replace("\r\n", "\n").replace("\r", "\n")
    cues = []
    for match in TIME_RE.finditer(text):
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
        body = text[line_end:block_end]
        body = TAG_RE.sub(" ", body)
        body = re.sub(r"\s+", " ", body).strip()
        if body and end > start:
            cues.append((start, end, body))
    return cues


def apply_edits(groups, document, source_hash):
    if document.get('sourceHash') != source_hash:
        raise ValueError('SRT degisti; dublaj metnini yeniden hazirlayin.')
    edits = document.get('edits', {})
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
    for g in groups:
        g['source_ids'] = [source_ids[i - 1] for i in g['source_ids']]
    return groups


def plan(path, start=None, end=None):
    source = Path(path)
    with source.open('rb') as handle:
        source_bytes = handle.read(2_000_001)
    if len(source_bytes) > 2_000_000:
        raise ValueError('SRT cok buyuk.')
    groups = make_groups(parse_srt(source, source_bytes), start, end)
    if not groups or len(groups) > 5000:
        raise ValueError('SRT grup sayisi gecersiz.')
    for g in groups:
        g['key'] = ','.join(map(str, g['source_ids']))
        g['seconds'] = (g['end'] - g['start']) / 1000
    return {'sourceHash': hashlib.sha256(source_bytes).hexdigest(), 'groups': groups}

if __name__ == '__main__':
    print(json.dumps(plan(sys.argv[1], *(map(float, sys.argv[2:4]))), ensure_ascii=True))
