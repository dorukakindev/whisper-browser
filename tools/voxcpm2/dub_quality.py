"""Model-free dubbing quality, cache identity and representative previews."""
import hashlib
import json
import re
import unicodedata
from difflib import SequenceMatcher

import numpy as np


def speech_check(expected, actual):
    def words(text):
        return re.findall(r"[^\W_]+", unicodedata.normalize('NFKC', text).casefold())
    target, heard = words(expected), words(actual)
    similarity = SequenceMatcher(None, target, heard, autojunk=False).ratio()
    missing_numbers = sorted(set(re.findall(r'\d+', expected)) - set(re.findall(r'\d+', actual)))
    # ASR is evidence for review, never permission to silently remove speech.
    return {'similarity': round(similarity, 4), 'missing_numbers': missing_numbers,
            'review': similarity < .65 or bool(missing_numbers) or not heard}


def chunk_key(settings, text, seed):
    return hashlib.sha256(json.dumps([settings, text, seed], ensure_ascii=True,
                                    sort_keys=True).encode()).hexdigest()


def valid_audio(path, sf):
    try:
        info = sf.info(str(path))
        return info.frames > 0 and info.channels == 1 and 8000 <= info.samplerate <= 192000
    except (OSError, RuntimeError):
        return False


def representative_groups(groups, max_seconds=55):
    """Choose short, long and dense speech; pack excerpts without huge silence."""
    duration = lambda g: (g['end'] - g['start']) / 1000
    candidates = [min(range(len(groups)), key=lambda i: len(groups[i]['text'])),
                  max(range(len(groups)), key=lambda i: len(groups[i]['text'])),
                  max(range(len(groups)), key=lambda i: len(groups[i]['text']) / duration(groups[i]))]
    selected, spent = [], 0
    for i in sorted(set(candidates)):
        if spent + duration(groups[i]) > max_seconds and selected:
            continue
        selected.append(dict(groups[i])); spent += duration(groups[i]) + .5
    cursor = 0
    for g in selected:
        # Malformed/very long cue windows must not turn a short preview into
        # hours of allocated silence. Full speech can still stretch this clip.
        length = min(g['end'] - g['start'], round(max_seconds * 1000))
        g['source_start'], g['source_end'] = g['start'], g['end']
        g['start'], g['end'] = cursor, cursor + length
        cursor += length + 500
    return selected


def reference_quality(audio, sr):
    wav = np.asarray(audio, dtype=np.float32)
    if wav.ndim > 1:
        wav = wav.mean(axis=1)
    if sr <= 0 or not len(wav) or not np.isfinite(wav).all():
        raise ValueError('Invalid reference audio.')
    step = max(1, round(sr * .1))
    levels = np.array([np.sqrt(np.mean(wav[i:i + step] ** 2)) for i in range(0, len(wav), step)])
    rms = float(np.sqrt(np.mean(wav ** 2)))
    silence = float(np.mean(levels < max(.003, float(levels.max()) * .04)))
    clipping = float(np.mean(np.abs(wav) >= .995))
    warnings = []
    if rms < .01: warnings.append('quiet')
    if clipping > .005: warnings.append('clipping')
    if silence > .45: warnings.append('silence')
    if len(wav) / sr < 3: warnings.append('short')
    # Suggest a dense 3–15 second window; do not alter the reference automatically.
    width = min(len(levels), 150)
    active = (levels >= max(.003, float(levels.max()) * .04)).astype(float)
    counts = np.convolve(active, np.ones(width), 'valid')
    begin = int(np.argmax(counts)) * .1
    return {'seconds': round(len(wav) / sr, 2), 'rms': round(rms, 5),
            'silence_fraction': round(silence, 3), 'clipping_fraction': round(clipping, 4),
            'warnings': warnings, 'suggested_start': round(begin, 2),
            'suggested_end': round(min(len(wav) / sr, begin + width * .1), 2)}
