"""Bounded regeneration selection shared by CLI and Windows file requests."""
import json
from pathlib import Path
import re


def force_group_keys(raw='', file=None):
    keys = list(filter(None, raw.split(';')))
    if file:
        with Path(file).open('rb') as handle:
            data = handle.read(100001)
        if len(data) > 100000:
            raise ValueError('Regeneration selection is too large.')
        values = json.loads(data.decode('utf-8-sig'))
        if not isinstance(values, list):
            raise ValueError('Invalid regeneration selection.')
        keys.extend(values)
    if (len(keys) > 5000 or sum(len(key) if isinstance(key,str) else 100001 for key in keys) > 100000
            or any(not isinstance(key,str) or not key or len(key)>2000
                   or not re.fullmatch(r'\d+(?:,\d+)*',key) for key in keys)):
        raise ValueError('Invalid group key.')
    return set(keys)
