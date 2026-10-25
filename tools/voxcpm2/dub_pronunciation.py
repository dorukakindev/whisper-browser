"""Explicit speech-only, case-sensitive dictionary. Never changes source cues."""
import json
import re
import unicodedata


def normalize(entries):
    if not isinstance(entries, list) or len(entries) > 100 or len(json.dumps(entries, ensure_ascii=False, separators=(',', ':'))) > 16000:
        raise ValueError('Use at most 100 pronunciation entries.')
    result, seen = [], set()
    for row in entries:
        if not isinstance(row, dict):
            raise ValueError('Invalid pronunciation entry.')
        source, target = (row.get(key) for key in ('from', 'to'))
        if not isinstance(source, str) or not isinstance(target, str):
            raise ValueError('Invalid pronunciation entry.')
        source, target = (unicodedata.normalize('NFC', value).strip() for value in (source, target))
        if (not source or not target or len(source) > 80 or len(target) > 120
                or not any(char.isalpha() for char in source)
                or any(ord(char) < 32 or ord(char) == 127 for char in source + target) or source in seen):
            raise ValueError('Invalid or duplicate pronunciation entry.')
        seen.add(source)
        result.append({'from': source, 'to': target})
    return result


def load(path):
    if path is None:
        return []
    if path.stat().st_size > 64000:
        raise ValueError('Pronunciation file is too large.')
    return normalize(json.loads(path.read_text(encoding='utf-8')))


def apply(text, entries):
    if not entries:
        return text
    replacements = {row['from']: row['to'] for row in entries}
    pattern = r'(?<!\w)(?:' + '|'.join(re.escape(key) for key in sorted(replacements, key=len, reverse=True)) + r')(?!\w)'
    return re.sub(pattern, lambda match: replacements[match.group()], text)


def cache_identity(identity, text, entries):
    pronounced = apply(text, entries)
    return identity + ('speech-pronunciation-v1', pronounced) if pronounced != text else identity
