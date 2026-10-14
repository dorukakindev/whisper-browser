"""Model-free SRT plan and separate reviewed dubbing text."""
import hashlib
import json
import re
import sys
from pathlib import Path
from dub_timing import sentence_plan

TAG_RE = re.compile(r"<[^>]+>|\{[^}]*\}")
TIME_RE = re.compile(
    r"(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})\s*-->\s*"
    r"(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})")


def parse_srt(path):
    """SRT -> [(start_ms, end_ms, temiz_metin)]."""
    text = Path(path).read_text(encoding="utf-8-sig", errors="replace")
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

def plan(path):
    source = Path(path)
    if source.stat().st_size > 2_000_000:
        raise ValueError('SRT cok buyuk.')
    groups = sentence_plan(parse_srt(source))
    if not groups or len(groups) > 5000:
        raise ValueError('SRT grup sayisi gecersiz.')
    for g in groups:
        g['key'] = ','.join(map(str, g['source_ids']))
        g['seconds'] = (g['end'] - g['start']) / 1000
    return {'sourceHash': hashlib.sha256(source.read_bytes()).hexdigest(), 'groups': groups}

if __name__ == '__main__':
    print(json.dumps(plan(sys.argv[1]), ensure_ascii=True))
