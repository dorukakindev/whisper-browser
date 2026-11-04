"""Model-free dubbing quality, cache identity and representative previews."""
import hashlib
import math
import json
import re
import unicodedata
from difflib import SequenceMatcher
from collections import Counter
from pathlib import Path

import numpy as np
from dub_finish import spoken_text, decimal_evidence, normalize_decimal_quantities, integer_words

# Shared with the pre-generation JS guard; this is conservative evidence,
# not a complete Turkish morphological or semantic analyzer.
NEGATIVE_ROOTS = json.loads((Path(__file__).resolve().parents[2] / 'src' / 'turkish-negation-roots.json').read_text(encoding='utf-8'))
# Include finite -mazsa/-mezse and inability -amazsa/-emezse conditionals.
NEGATIVE_ENDING = re.compile(r'(?:(?:m[ae]|y?[ae]m[ae])zs[ae](?:m|n|k|n[ıi]z|l[ae]r)?|m[ıiuü]yor[^\W_]*|m[ae]y[ae]c[ae][kğ][^\W_]*|m[ae](?:d[ae]n|ks[ıi]z[ıi]n|y[ıi]nc[ae]|m|z(?:s[ıi]n(?:[ıi]z)?|lar|ler)?|y[ıi]z|s[ıi]n(?:lar|ler)?|y[ıiuü]n(?:[ıiuü]z)?|y[ae]l[ıi]m)?|y?[ae]m[ae](?:m|z(?:s[ıi]n(?:[ıi]z)?|lar|ler)?|y[ıi]z|s[ıi]n)?|y?[ae]m[ıiuü]yor[^\W_]*|y?[ae]m[ae]y[^\W_]*)')

# Exact third-person partitives in compound cardinals: "on ikisi" still
# denotes twelve. Require a cardinal prefix; do not stem unrelated words or
# reinterpret standalone ambiguous forms such as "yüzü" (his/her face).
COMPOUND_PARTITIVE_DIGITS = {'biri': 'bir', 'ikisi': 'iki', 'üçü': 'üç',
    'dördü': 'dört', 'beşi': 'beş', 'altısı': 'altı', 'yedisi': 'yedi',
    'sekizi': 'sekiz', 'dokuzu': 'dokuz'}
CARDINAL_PREFIXES = set('on yirmi otuz kırk elli altmış yetmiş seksen doksan yüz bin milyon milyar'.split())


def lexical_negatives(text):
    tokens = re.findall(r'[^\W_]+', unicodedata.normalize('NFC', text).replace('I','ı').replace('İ','i').lower())
    return sorted(token for token in tokens if any(token.startswith(root) and NEGATIVE_ENDING.fullmatch(token[len(root):]) for root in NEGATIVE_ROOTS))


def verification_request(path, expected):
    # Distinctive Turkish orthography, not broad ö/ü/ç shared with other languages.
    # ASCII/unknown text keeps automatic detection; no reference voice language
    # or target wording is injected as an ASR prompt.
    request = {'path': str(path)}
    if re.search('[ğĞıİşŞ]', unicodedata.normalize('NFC', expected)):
        request['language'] = 'tr'
    return request


def speech_check(expected, actual, numeric_reference=None):
    # Retain bounded original ASR evidence before quantity/case normalization.
    recognized_text = actual[:8000]
    decimal_context = decimal_evidence(expected if numeric_reference is None else numeric_reference)
    if decimal_context:
        # Canonicalize only explicit decimal speech. Integer fraction readings
        # ('on dört') and digit readings ('bir dört') denote the same fraction.
        for row in decimal_context:
            fraction=row['number'].split('.')[1]
            if not fraction.startswith('0'):
                actual=re.sub(r'\b(?:virgül|nokta)\s+'+re.escape(integer_words(fraction))+r'\b', 'virgül '+' '.join(integer_words(d) for d in fraction), actual, flags=re.I)
    expected=normalize_decimal_quantities(expected)
    case_suffix=r'(?:e|a|ye|ya|i|ı|u|ü|yi|yı|yu|yü|ın|in|un|ün|nın|nin|nun|nün|dan|den|tan|ten|da|de|ta|te|la|le|yla|yle)'
    name_cases=re.findall(r"\b((?:[A-ZÇĞİÖŞÜ]{2,}|[A-ZÇĞİÖŞÜ][a-zçğıöşü]+))['’]("+case_suffix+r')\b',expected)
    def words(text):
        for name,suffix in name_cases:
            text=re.sub(r'\b'+re.escape(name)+r"['’]?"+re.escape(suffix)+r'\b',
                        name+suffix,text,flags=re.I)
        normalized = unicodedata.normalize('NFKC', spoken_text(text))
        # ASR can write the spoken "on ikisi" as the malformed "12'i".
        # Prove its exact integer value without changing production speech or
        # stripping arbitrary endings. Retain the case/possessive suffix as a
        # separate alignment token; dates, IDs and leading zeros stay literal.
        normalized = re.sub(r"(?<![\w.,:/+\-−])((?:[1-9]\d{0,8}|0))['’]"
                            r"(yi|yı|yu|yü|si|sı|su|sü|i|ı|u|ü)(?!\w)",
                            lambda m: integer_words(m[1]) + ' ' + m[2], normalized)
        # A Turkish-letter word establishes local casing without changing
        # English 'I' or Latin acronyms throughout a mixed-language block.
        normalized = re.sub(r'[^\W_]+', lambda m: m[0].replace('I','ı').replace('İ','i') if re.search('[çğıöşüÇĞİÖŞÜ]',m[0]) else m[0], normalized)
        tokens = re.findall(r"[^\W_]+", normalized.casefold().replace('i\u0307', 'i'))
        return [COMPOUND_PARTITIVE_DIGITS.get(token, token)
                if i and tokens[i-1] in CARDINAL_PREFIXES else token
                for i, token in enumerate(tokens)]
    # Ambiguous dotted literals keep their production pronunciation. Only the
    # actual transcript's complete cardinal phrase can establish a thousands
    # reading for verification; a numeric ASR spelling alone proves nothing.
    number_words=set('sıfır bir iki üç dört beş altı yedi sekiz dokuz on yirmi otuz kırk elli altmış yetmiş seksen doksan yüz bin milyon milyar virgül'.split())
    transcript_words = words(actual)
    def proven_grouped_reference(text):
        def replace(match):
            digits = match[0].replace('.', '')
            if digits.startswith('0') or len(digits) > 9:
                return match[0]
            if re.search(r'\b(?:sürüm|versiyon|version|build|kod|numara|id|ip|port)\s*:?\s*$', text[max(0,match.start()-48):match.start()], re.I):
                return match[0]
            phrase = words(integer_words(digits))
            if any(transcript_words[i:i+len(phrase)] == phrase
                   and (i == 0 or transcript_words[i-1] not in number_words)
                   and (i+len(phrase) == len(transcript_words) or transcript_words[i+len(phrase)] not in number_words)
                   for i in range(len(transcript_words)-len(phrase)+1)):
                return integer_words(digits)
            return match[0]
        return re.sub(r"(?<![\w.,:/+\-−'’])\d{1,3}(?:\.\d{3})+(?![\w.,:/+\-−]|['’]\w)", replace, text)
    expected = proven_grouped_reference(expected)
    if numeric_reference is not None:
        numeric_reference = proven_grouped_reference(numeric_reference)
    target = words(expected)
    # ASR may print the spoken "elli bin" as "50.000". Only interpret a
    # dotted thousands spelling when that exact whole quantity is present in
    # the expected spoken text. Do not reinterpret arbitrary dates/decimals.
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
        # Keep the scale spoken: integer_words deliberately bounds standalone
        # digit expansion, whereas '8 milyar' already states an exact scale.
        return integer_words(match[1]) + ' ' + match[2].casefold()
    actual=re.sub(r'(?<![\w.,])(\d{1,3})\s+(bin|milyon|milyar)\b',mixed_number,actual,flags=re.I)
    heard = words(actual)
    def spoken_quantities(tokens):
        rows=[]; current=[]
        for token in [*tokens, '']:
            if token in number_words: current.append(token)
            else:
                if current and current != ['bir']: rows.append(tuple(current))
                current=[]
        return tuple(rows)
    spoken_number_mismatch = spoken_quantities(target) != spoken_quantities(heard)
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
    def checked_number_phrase(number):
        # An apostrophe-inflected year deliberately remains literal in spoken_text.
        # Prove the same atomic year in BOTH streams even when another ASR word
        # differs; never waive a missing, changed or duplicated quantity.
        if (re.fullmatch(r'\d{4}', number) and number in target and number in heard
                and re.search(r'(?<!\w)'+re.escape(number)+r"['’](?:te|ta|de|da|ten|tan|den|dan)\b", reference, re.I)):
            return [number]
        return words(number + ' kişi')[:-1]

    remaining = list(heard)
    missing_numbers = []
    reference = expected if numeric_reference is None else normalize_decimal_quantities(numeric_reference)
    # Dates/ranges/IDs deliberately remain unexpanded in spoken_text. An exact
    # normalized transcript already proves their presence; converting isolated
    # fragments ('5-10' -> 'beş', 'on') would falsely reject the unchanged text.
    numbers_to_check = [] if words(reference) == heard else re.findall(r'\d+(?:[.,]\d+)*', reference)
    for number in numbers_to_check:
        phrase = checked_number_phrase(number)
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
        phrase = checked_number_phrase(number)
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
    semantic_mismatch = (meaning_evidence(expected) != meaning_evidence(actual)
                         or lexical_negatives(expected) != lexical_negatives(actual))
    names = re.findall(r"\b[A-ZÇĞİÖŞÜ][a-zçğıöşü]+(?=['’])", expected)
    # Bare names may appear at sentence start and ASR need not capitalize
    # them. Protect the source's capitalized lexical roots case-insensitively;
    # an ordinary unchanged opening word passes the same normalized check.
    names += re.findall(r'\b[A-ZÇĞİÖŞÜ][a-zçğıöşü]+\b', expected)
    names = list(dict.fromkeys(names))
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
    return {'decimalEvidence': decimal_context, 'recognizedText': recognized_text, 'similarity': round(similarity, 4), 'omission_spans': omissions, 'insertion_spans': insertions,
            'missing_numbers': missing_numbers, 'added_numbers': added_numbers,
            'percentage_mismatch': percentage_mismatch, 'semantic_mismatch': semantic_mismatch, 'spoken_number_mismatch': spoken_number_mismatch,
            'lost_negation': lost_negation, 'added_negation': added_negation, 'unit_mismatch': unit_mismatch,
            'repetition': repetition, 'sign_mismatch': sign_mismatch, 'missing_names': missing_names,
            'review': spoken_number_mismatch or similarity < .85 or bool(omissions) or bool(insertions) or bool(missing_numbers) or bool(added_numbers) or percentage_mismatch or semantic_mismatch or lost_negation or added_negation or unit_mismatch or repetition or sign_mismatch or bool(missing_names) or not heard}


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


def audio_identity(path):
    digest=hashlib.sha256()
    size=0
    with path.open('rb') as stream:
        for block in iter(lambda:stream.read(1024*1024),b''):
            digest.update(block);size+=len(block)
    return {'sha256':digest.hexdigest(),'bytes':size}


def matches_recorded_audio(path):
    try:
        record=json.loads(path.with_suffix('.json').read_text(encoding='utf-8'))
        expected=record.get('audioIdentity')
        # Legacy audio remains available for listening, never upgraded to ready.
        return expected is None or expected==audio_identity(path)
    except (OSError,ValueError,AttributeError):
        return True  # Existing missing-sidecar path remains review-only.


def cached_record(path):
    try:
        record = json.loads(path.with_suffix('.json').read_text(encoding='utf-8'))
        if (isinstance(record, dict) and record.get('status') in ('ready', 'review')
                and isinstance(record.get('verification'), dict)
                and isinstance(record.get('text'), str) and record['text'].strip()):
            if record.get('audioIdentity') != audio_identity(path):
                return {**record,'status':'review','verification':{'status':'unavailable','reason':'audio_identity_unproven'}}
            if record['verification'].get('status') not in ('passed', 'not_checked'):
                record['status'] = 'review'
            # Old cache entries can predate a semantic guard. Re-evaluate their
            # stored ASR evidence without rerunning the GPU or changing audio.
            # Never upgrade an earlier review, and preserve unchecked records.
            verification = record['verification']
            heard = verification.get('recognizedText')
            expected = record.get('pronunciationText')
            if not isinstance(expected, str) or not expected.strip():
                expected = record['text']
            if (record['status'] == 'ready' and verification.get('status') == 'passed'
                    and isinstance(heard, str)):
                reference = record.get('numericReference')
                if not isinstance(reference, str) or not reference.strip() or len(reference) > 16000:
                    reference = record['text']
                    # Older successful records retained decimal evidence but
                    # stored only the expanded display text. Restore only exact
                    # spoken quantities proven by that original verification;
                    # this avoids regenerating correct existing audio on reopen.
                    evidence = verification.get('decimalEvidence')
                    for row in evidence[:64] if isinstance(evidence, list) else []:
                        number = row.get('number') if isinstance(row, dict) else None
                        if (not isinstance(number, str) or not re.fullmatch(r'\d{1,9}\.\d{1,2}', number)
                                or row.get('decimal_context') not in ('unit', 'currency_or_percent')):
                            continue
                        phrase = spoken_text(number.replace('.', ','))
                        reference = re.sub(r'(?<!\w)'+re.escape(phrase)+r'(?!\w)',
                                           lambda _: number, reference, count=1)
                checked = speech_check(expected, heard, numeric_reference=reference)
                if checked['review']:
                    record['status'] = 'review'
                    record['verification'] = {**verification, **checked, 'status': 'review'}
            return record
    except (OSError, ValueError):
        pass
    return {'status': 'review', 'verification': {'status': 'unavailable'}}


def valid_audio(path, sf):
    try:
        # Headers do not establish usable speech: float WAV can contain NaN,
        # truncated payload or only digital silence. Bound memory while scanning
        # the entire cache entry so corruption near its end is not missed.
        with sf.SoundFile(str(path)) as audio:
            if audio.frames <= 0 or audio.channels != 1 or not 8000 <= audio.samplerate <= 192000:
                return False
            frames, audible = 0, False
            for block in audio.blocks(blocksize=65536, dtype='float32'):
                if not np.isfinite(block).all():
                    return False
                frames += len(block)
                audible = audible or bool(np.any(np.abs(block) > 1e-7))
            return frames == audio.frames and audible
    except (OSError, RuntimeError, ValueError, TypeError):
        return False


def matches_recorded_duration(path, sf):
    """Do not reuse a shortened WAV under a previously verified duration.

    Missing/unreadable metadata remains review-only through cached_record.
    Existing duration fields must be finite positive numbers, not booleans.
    """
    try:
        record = json.loads(path.with_suffix('.json').read_text(encoding='utf-8'))
    except (OSError, ValueError):
        return True
    if not isinstance(record, dict) or 'final_seconds' not in record:
        return True
    expected = record['final_seconds']
    if isinstance(expected, bool) or not isinstance(expected, (int, float)) or not math.isfinite(expected) or expected <= 0:
        return False
    try:
        info = sf.info(str(path))
        return abs(info.frames - expected * info.samplerate) <= max(2.0, info.samplerate * .001)
    except (OSError, ValueError, RuntimeError):
        return False


def representative_groups(groups, max_seconds=55):
    """Choose short, long and dense speech; pack excerpts without huge silence."""
    if not isinstance(max_seconds, (int, float)) or not math.isfinite(max_seconds) or max_seconds <= 0:
        raise ValueError('Invalid preview duration.')
    if not groups:
        return []
    for group in groups:
        if (not isinstance(group, dict) or not isinstance(group.get('text'), str)
                or any(not isinstance(group.get(k), (int, float)) or not math.isfinite(group[k]) for k in ('start', 'end'))
                or group['start'] < 0 or group['end'] <= group['start']):
            raise ValueError('Invalid preview group timing.')
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
    # Float WAV may be finite but over-range. Accumulate RMS in float64 so
    # quality metadata stays finite and reports clipping instead of Infinity.
    wav = np.asarray(audio, dtype=np.float64)
    if (wav.ndim not in (1, 2) or not wav.size or (wav.ndim == 2 and not wav.shape[1])
            or not isinstance(sr, (int, float)) or not math.isfinite(sr) or sr <= 0
            or not np.isfinite(wav).all()):
        raise ValueError('Invalid reference audio.')
    channels = wav.shape[1] if wav.ndim == 2 else 1
    source = wav.reshape(-1, channels)
    channel_rms = np.sqrt(np.mean(source ** 2, axis=0))
    channel_clipping = np.mean(np.abs(source) >= .995, axis=0)
    source_rms = float(np.sqrt(np.mean(source ** 2)))
    source_peak = float(np.max(np.abs(source)))
    if wav.ndim == 2:
        wav = wav.mean(axis=1)
    if not np.isfinite(wav).all():
        raise ValueError('Invalid reference audio.')
    step = max(1, round(sr * .1))
    levels = np.array([np.sqrt(np.mean(wav[i:i + step] ** 2)) for i in range(0, len(wav), step)])
    rms = float(np.sqrt(np.mean(wav ** 2)))
    silence = float(np.mean(levels < max(.003, float(levels.max()) * .04)))
    # Downmixing can hide a clipped channel or cancel opposite-polarity audio.
    # Clipping is a source-channel diagnostic, not a property of the average.
    clipping = float(channel_clipping.max())
    downmix_loss = 20 * math.log10(max(rms, 1e-12) / max(source_rms, 1e-12))
    warnings = []
    if rms < .01: warnings.append('quiet')
    if clipping > .005: warnings.append('clipping')
    if silence > .45: warnings.append('silence')
    if len(wav) / sr < 3: warnings.append('short')
    if channels > 1 and source_rms >= .01 and downmix_loss < -12:
        warnings.append('downmix-cancellation')
    # Suggest a dense 3–15 second window; do not alter the reference automatically.
    width = min(len(levels), 150)
    active = (levels >= max(.003, float(levels.max()) * .04)).astype(float)
    counts = np.convolve(active, np.ones(width), 'valid')
    begin = int(np.argmax(counts)) * .1
    return {'seconds': round(len(wav) / sr, 2), 'rms': round(rms, 5),
            'channels': channels, 'source_peak': round(source_peak, 5), 'source_rms': round(source_rms, 5),
            'channel_rms': [round(float(v), 5) for v in channel_rms],
            'channel_clipping_fraction': [round(float(v), 4) for v in channel_clipping],
            'downmix_loss_db': round(downmix_loss, 2),
            'silence_fraction': round(silence, 3), 'clipping_fraction': round(clipping, 4),
            'warnings': warnings, 'suggested_start': round(begin, 2),
            'suggested_end': round(min(len(wav) / sr, begin + width * .1), 2)}
