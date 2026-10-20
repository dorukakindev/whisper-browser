"""Model-free dubbing quality, cache identity and representative previews."""
import hashlib
import json
import re
import unicodedata
from difflib import SequenceMatcher
from collections import Counter

import numpy as np
from dub_finish import spoken_text


def speech_check(expected, actual, numeric_reference=None):
    def words(text):
        return re.findall(r"[^\W_]+", unicodedata.normalize('NFKC', spoken_text(text)).casefold().replace('i\u0307', 'i'))
    target, heard = words(expected), words(actual)
    similarity = SequenceMatcher(None, target, heard, autojunk=False).ratio()
    # ASR routinely writes '12,5' where TTS reads 'on iki virgül beş'.
    # Match complete normalized number phrases, consuming each occurrence once.
    number_words=set('sıfır bir iki üç dört beş altı yedi sekiz dokuz on yirmi otuz kırk elli altmış yetmiş seksen doksan yüz bin milyon milyar virgül'.split())
    remaining = list(heard)
    missing_numbers = []
    for number in re.findall(r'\d+(?:[.,]\d+)*', expected if numeric_reference is None else numeric_reference):
        phrase = words(number + ' kişi')[:-1]
        found = next((i for i in range(len(remaining)-len(phrase)+1) if remaining[i:i+len(phrase)] == phrase
                      and (i==0 or remaining[i-1] not in number_words)
                      and (i+len(phrase)==len(remaining) or remaining[i+len(phrase)] not in number_words)), None)
        if found is None:
            missing_numbers.append(number)
        else:
            remaining[found:found+len(phrase)] = ['_consumed_'] * len(phrase)
    target_counts, heard_counts = Counter(target), Counter(heard)
    # Tokenization splits English contractions into don/t and can/t; preserve
    # their negative meaning even when a single lost word barely changes ratio.
    negative_forms = r"\b(?:[a-z]+n['’]t|cannot)\b"
    contraction_loss = (len(re.findall(negative_forms, expected, re.I)) + target_counts['not']
                        > len(re.findall(negative_forms, actual, re.I)) + heard_counts['not'])
    # Minus signs disappear during ordinary word tokenization. Check each
    # signed quantity against its spoken sign, rather than just word overlap.
    reference = expected if numeric_reference is None else numeric_reference
    signed_actual = re.sub(r'(?<![\w.,])[-−]\s*(\d+(?:[.,]\d+)*)',
                           lambda m: ' eksi ' + m[1], actual)
    signed_words = words(signed_actual)
    sign_mismatch = False
    for number in re.findall(r'(?<![\w.,])[-−]\s*(\d+(?:[.,]\d+)*)', reference):
        phrase = words(number + ' kişi')[:-1]
        found = next((i for i in range(len(signed_words)-len(phrase))
                      if signed_words[i] in ('eksi', 'minus') and signed_words[i+1:i+1+len(phrase)] == phrase
                      and (i+1+len(phrase)==len(signed_words) or signed_words[i+1+len(phrase)] not in number_words)), None)
        if found is None:
            sign_mismatch = True
        else:
            signed_words[found:found+1+len(phrase)] = ['_consumed_'] * (1+len(phrase))
    lost_negation = contraction_loss or any(heard_counts[word] < count for word, count in target_counts.items()
                        if word.startswith(('değil', 'yok', 'asla', 'hiç')) or word in ('not', 'never', 'no'))
    repetition = any(count > target_counts[word] + 1 for word, count in heard_counts.items())
    names = re.findall(r"\b[A-ZÇĞİÖŞÜ][a-zçğıöşü]+(?=['’])", expected)
    missing_names = [name for name in names if not all(word in heard_counts for word in words(name))]
    # ASR is evidence for review, never permission to silently remove speech.
    return {'similarity': round(similarity, 4), 'missing_numbers': missing_numbers,
            'lost_negation': lost_negation, 'repetition': repetition, 'sign_mismatch': sign_mismatch, 'missing_names': missing_names,
            'review': similarity < .85 or bool(missing_numbers) or lost_negation or repetition or sign_mismatch or bool(missing_names) or not heard}


def chunk_key(settings, text, seed):
    return hashlib.sha256(json.dumps([settings, text, seed], ensure_ascii=True,
                                    sort_keys=True).encode()).hexdigest()


def duration_identity(cues, i, window, manual=False):
    return {'protocol': 'duration-edit-v2', 'manual': bool(manual), 'text': cues[i][2], 'seconds': window,
            'before': cues[i - 1][2][-1500:] if i else '',
            'after': cues[i + 1][2][:1500] if i + 1 < len(cues) else ''}


def cached_record(path):
    try:
        record = json.loads(path.with_suffix('.json').read_text(encoding='utf-8'))
        if (isinstance(record, dict) and record.get('status') in ('ready', 'review')
                and isinstance(record.get('verification'), dict)
                and isinstance(record.get('text'), str) and record['text'].strip()):
            return record
    except (OSError, ValueError):
        pass
    return {'status': 'review', 'verification': {'status': 'unavailable'}}


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
