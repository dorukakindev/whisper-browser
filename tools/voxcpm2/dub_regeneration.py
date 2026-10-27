"""Bounded regeneration selections; long chapters never need long Windows argv."""
import json
import re
from pathlib import Path


def load_keys(inline='', selection_file=None):
    if selection_file:
        if inline:
            raise ValueError('Choose one regeneration selection source.')
        with Path(selection_file).open('rb') as handle:
            data=handle.read(150001)
        if len(data)>150000:
            raise ValueError('Regeneration selection is too large.')
        values=json.loads(data)
    else:
        values=list(filter(None, inline.split(';')))
    if (not isinstance(values,list) or len(values)>5000
            or any(not isinstance(key,str) or len(key)>2000
                   or not re.fullmatch(r'\d+(?:,\d+)*',key) for key in values)
            or len(';'.join(values))>100000):
        raise ValueError('Invalid regeneration group selection.')
    return set(values)


def select_keys(requested, current_keys, force_all=False):
    current=set(current_keys)
    if force_all and requested:
        raise ValueError('Whole-plan regeneration cannot include individual groups.')
    if requested-current:
        raise ValueError('Selected group is outside the current plan.')
    return current if force_all else requested
