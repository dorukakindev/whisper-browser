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
    case_suffix=r'(?:e|a|ye|ya|i|ı|u|ü|yi|yı|yu|yü|ın|in|un|ün|nın|nin|nun|nün|dan|den|tan|ten|da|de|ta|te|la|le|yla|yle)'
    name_cases=re.findall(r"\b([A-ZÇĞİÖŞÜ][a-zçğıöşü]+)['’]("+case_suffix+r')\b',expected)
    def words(text):
        for name,suffix in name_cases:
            text=re.sub(r'\b'+re.escape(name)+r"['’]?"+re.escape(suffix)+r'\b',
                        name+suffix,text,flags=re.I)
        return re.findall(r"[^\W_]+", unicodedata.normalize('NFKC', spoken_text(text)).casefold().replace('i\u0307', 'i'))
    target = words(expected)
    # ASR may print the spoken "elli bin" as "50.000". Only interpret a
    # dotted thousands spelling when that exact whole quantity is present in
    # the expected spoken text. Do not reinterpret arbitrary dates/decimals.
    number_words=set('sıfır bir iki üç dört beş altı yedi sekiz dokuz on yirmi otuz kırk elli altmış yetmiş seksen doksan yüz bin milyon milyar virgül'.split())
    def expected_quantity(digits):
        phrase = words(digits + ' kişi')[:-1]
        return any(target[i:i+len(phrase)] == phrase
                    and (i == 0 or target[i-1] not in number_words)
                    and (i+len(phrase) == len(target) or target[i+len(phrase)] not in number_words)
                    for i in range(len(target)-len(phrase)+1))
    def grouped_number(match):
        digits = match.group(0).replace('.', '')
        return digits if expected_quantity(digits) else match.group(0)
    actual = re.sub(r'(?<![\w.,])\d{1,3}(?:\.\d{3})+(?![\w.,])', grouped_number, actual)
    def mixed_number(match):
        digits=str(int(match[1])*{'bin':1000,'milyon':1000000,'milyar':1000000000}[match[2].casefold()])
        return digits
    actual=re.sub(r'(?<![\w.,])(\d{1,3})\s+(bin|milyon|milyar)\b',mixed_number,actual,flags=re.I)
    heard = words(actual)
    alignment = SequenceMatcher(None, target, heard, autojunk=False)
    similarity = alignment.ratio()
    # A high overall similarity can hide an unfinished ending or a missing
    # clause in a long block. Report sustained gaps separately from typos and
    # ASR substitutions; these are review evidence, never automatic edits.
    omissions, insertions = [], []
    for tag, a0, a1, b0, b1 in alignment.get_opcodes():
        if tag == 'equal':
            continue
        missing, added = a1-a0, b1-b0
        if missing-added >= 4 or (len(target) >= 10 and missing-added >= 3 and (a0 == 0 or a1 == len(target))):
            omissions.append({'start': a0, 'end': a1})
        if added-missing >= 4:
            insertions.append({'start': b0, 'end': b1})
    # ASR routinely writes '12,5' where TTS reads 'on iki virgül beş'.
    # Match complete normalized number phrases, consuming each occurrence once.
    remaining = list(heard)
    missing_numbers = []
    reference = expected if numeric_reference is None else numeric_reference
    # Dates/ranges/IDs deliberately remain unexpanded in spoken_text. An exact
    # normalized transcript already proves their presence; converting isolated
    # fragments ('5-10' -> 'beş', 'on') would falsely reject the unchanged text.
    numbers_to_check = [] if words(reference) == heard else re.findall(r'\d+(?:[.,]\d+)*', reference)
    for number in numbers_to_check:
        phrase = words(number + ' kişi')[:-1]
        found = next((i for i in range(len(remaining)-len(phrase)+1) if remaining[i:i+len(phrase)] == phrase
                      and (i==0 or remaining[i-1] not in number_words)
                      and (i+len(phrase)==len(remaining) or remaining[i+len(phrase)] not in number_words)), None)
        if found is None:
            missing_numbers.append(number)
        else:
            remaining[found:found+len(phrase)] = ['_consumed_'] * len(phrase)
    target_counts, heard_counts = Counter(target), Counter(heard)
    # Number presence alone misses invented quantities and unit swaps.
    remaining_expected = list(target)
    added_numbers = []
    for number in ([] if target == heard else re.findall(r'\d+(?:[.,]\d+)*', actual)):
        phrase = words(number + ' kişi')[:-1]
        found = next((i for i in range(len(remaining_expected)-len(phrase)+1)
                      if remaining_expected[i:i+len(phrase)] == phrase
                      and (i == 0 or remaining_expected[i-1] not in number_words)
                      and (i+len(phrase) == len(remaining_expected) or remaining_expected[i+len(phrase)] not in number_words)), None)
        if found is None:
            added_numbers.append(number)
        else:
            remaining_expected[found:found+len(phrase)] = ['_consumed_'] * len(phrase)
    # Tokenization splits English contractions into don/t and can/t; preserve
    # their negative meaning even when a single lost word barely changes ratio.
    negative_forms = r"\b(?:[a-z]+n['’]t|cannot)\b"
    contraction_loss = (len(re.findall(negative_forms, expected, re.I)) + target_counts['not']
                        > len(re.findall(negative_forms, actual, re.I)) + heard_counts['not'])
    # Check both directions: a newly invented minus sign or a lost plus sign
    # can reverse a quantity while leaving >95% of a long narration unchanged.
    # Canonicalize written signs and spoken TR/EN signs, preserving order and multiplicity.
    def signed_quantities(text):
        signed = re.sub(r'(?<![\w.,])([+\-−])\s*(\d+(?:[.,]\d+)*)',
                        lambda m: (' eksi ' if m[1] in '-−' else ' artı ') + m[2], text)
        tokens = words(signed)
        quantities = []
        for i, token in enumerate(tokens):
            if token not in ('eksi', 'minus', 'artı', 'plus'):
                continue
            stop = i + 1
            while stop < len(tokens) and (tokens[stop] in number_words or tokens[stop].isdecimal()):
                stop += 1
            if stop > i + 1:
                quantities.append(('-' if token in ('eksi', 'minus') else '+', tuple(tokens[i+1:stop])))
        return tuple(quantities)
    sign_mismatch = signed_quantities(reference) != signed_quantities(actual)
    lost_negation = contraction_loss or any(heard_counts[word] < count for word, count in target_counts.items()
                        if word.startswith(('değil', 'yok', 'asla', 'hiç')) or word in ('not', 'never', 'no', 'without'))
    repetition = any(count > target_counts[word] + 1 for word, count in heard_counts.items())
    # A duplicated phrase can be only a small fraction of a long sentence;
    # global similarity and single-word counts otherwise both miss it.
    for size in range(3, 7):
        expected_phrases = Counter(tuple(target[i:i+size]) for i in range(len(target)-size+1))
        for i in range(len(heard)-2*size+1):
            phrase = tuple(heard[i:i+size])
            if phrase == tuple(heard[i+size:i+2*size]) and expected_phrases[phrase] < 2:
                repetition = True
    english_negation = {'not', 'never', 'no', 'without'}
    def negatives(text, counts):
        return len(re.findall(negative_forms, text, re.I)) + sum(counts[w] for w in english_negation)
    added_negation = negatives(actual, heard_counts) > negatives(expected, target_counts) or any(
        heard_counts[word] > target_counts[word] for word in ('değil', 'yok', 'asla', 'hiç', 'hiçbir'))
    unit_words = {'kilometre', 'kilogram', 'santimetre', 'milimetre', 'metre', 'gram', 'miligram', 'litre', 'mililitre', 'celsius', 'fahrenheit'}
    unit_mismatch = any(target_counts[word] != heard_counts[word] for word in unit_words)
    def quantities(tokens):
        result = []
        for i, token in enumerate(tokens):
            if token not in unit_words:
                continue
            j = i
            while j and tokens[j-1] in number_words:
                j -= 1
            if j < i:
                result.append((tuple(tokens[j:i]), token))
        return Counter(result)
    unit_mismatch = unit_mismatch or quantities(target) != quantities(heard)
    percentage_mismatch = target_counts['yüzde'] != heard_counts['yüzde']
    def meaning_evidence(text):
        # Compare the spoken form: '$5' is read, and transcribed, as 'beş dolar'.
        lower = spoken_text(text).casefold().replace('i\u0307', 'i')
        patterns = {
            'currency': r'[$€£₺¥]|\b(?:dolar|dollar|usd|euro|eur|lira|try|sterlin|gbp|yen|jpy)\b',
            'past_negation': r'\b[^\W_]{2,}m[ae](?:d[ıiuü]|m[ıiuü]ş)[^\W_]*\b',
            # Long blocks can have >95% similarity after reversing an instruction.
            'negative_instruction': r'\b[^\W_]{2,}(?:m[ae]y[ıiuü]n(?:[ıiuü]z)?|m[ae]m[ae]l[ıi][^\W_]*)\b',
            'modality': r'\b(?:[^\W_]*abilir[^\W_]*|[^\W_]*ebilir[^\W_]*|belki|muhtemelen|possibly|perhaps|might|may|must|should)\b',
            'comparison': r'[<>≤≥≠]=?',
        }
        return {key: sorted(re.findall(pattern, lower)) for key, pattern in patterns.items()}
    # Punctuation and acronym capitalization are not reliable ASR evidence;
    # these gates are enforced before rewriting, not inferred from ASR casing.
    semantic_mismatch = meaning_evidence(expected) != meaning_evidence(actual)
    names = re.findall(r"\b[A-ZÇĞİÖŞÜ][a-zçğıöşü]+(?=['’])", expected)
    def name_heard(name):
        if all(word in heard_counts for word in words(name)):
            return True
        # ASR often omits the Turkish apostrophe: Venüs'e -> Venüse.
        # Require the exact expected root AND case ending; no fuzzy name matching.
        for suffix in re.findall(r'\b'+re.escape(name)+r"['’]("+case_suffix+r')\b',expected):
            if all(word in heard_counts for word in words(name+suffix)):
                return True
        return False
    missing_names = [name for name in names if not name_heard(name)]
    # ASR is evidence for review, never permission to silently remove speech.
    return {'similarity': round(similarity, 4), 'omission_spans': omissions, 'insertion_spans': insertions,
            'missing_numbers': missing_numbers, 'added_numbers': added_numbers,
            'percentage_mismatch': percentage_mismatch, 'semantic_mismatch': semantic_mismatch,
            'lost_negation': lost_negation, 'added_negation': added_negation, 'unit_mismatch': unit_mismatch,
            'repetition': repetition, 'sign_mismatch': sign_mismatch, 'missing_names': missing_names,
            'review': similarity < .85 or bool(omissions) or bool(insertions) or bool(missing_numbers) or bool(added_numbers) or percentage_mismatch or semantic_mismatch or lost_negation or added_negation or unit_mismatch or repetition or sign_mismatch or bool(missing_names) or not heard}


def generation_status(score, verification):
    return 'review' if score > 0 or verification.get('status') not in ('passed', 'not_checked') else 'ready'


def apply_timing_quality(row, timing):
    if timing.get('tempo_error'):
        row['tempoFallback'] = True
        if row.get('status') != 'failed':
            row['status'] = 'review'
    if timing.get('cut_frames', 0) > 0:
        row['clipped'] = True
        if row.get('status') != 'failed':
            row['status'] = 'review'


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
            if record['verification'].get('status') not in ('passed', 'not_checked'):
                record['status'] = 'review'
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
