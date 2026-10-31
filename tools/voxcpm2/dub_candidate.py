"""Objective rhythm diagnostics and a conservative optional-candidate gate.

This is not a naturalness score. Pace is only a retry hint. The caller may try
ONE alternate only for detected risk, and must retain its first usable result
on exceptions, unavailable ASR, or rejection. Nothing here performs I/O or TTS.
"""
import hashlib
import math
import re

import numpy as np

VERSION = 'bounded-rhythm-candidate-v1'
MAX_RETRIES = 1
MAX_SECONDS = 120
CONTENT_FLAGS = ('omission_spans', 'insertion_spans', 'missing_numbers', 'added_numbers',
                 'percentage_mismatch', 'semantic_mismatch', 'spoken_number_mismatch',
                 'lost_negation', 'added_negation', 'unit_mismatch', 'repetition',
                 'sign_mismatch', 'missing_names')


def measure_samples(wav, sr, text=''):
    """Measure at 20ms resolution, preserving samples and channel energy.

    Bounds and clipping gates fail closed; silence/noise are not asserted to be
    speech. Full ASR remains mandatory for candidate acceptance.
    """
    invalid = {'status': 'unavailable', 'valid': False}
    try:
        if isinstance(sr, bool) or not isinstance(sr, (int, float)) or not math.isfinite(sr) or not 8000 <= sr <= 192000:
            return invalid
        audio = np.asarray(wav)
        if (audio.ndim not in (1, 2) or not audio.size or len(audio) > sr * MAX_SECONDS
                or (audio.ndim == 2 and audio.shape[1] not in (1, 2))):
            return invalid
        audio = audio.astype(np.float64)
        if not np.isfinite(audio).all():
            return invalid
        peak = float(np.max(np.abs(audio)))
        if peak > 1.05:
            return invalid
        energy = audio**2 if audio.ndim == 1 else (audio**2).mean(axis=1)
        width = max(1, round(sr * .02))
        starts = np.arange(0, len(audio), width)
        counts = np.minimum(width, len(audio)-starts)
        levels = np.sqrt(np.add.reduceat(energy, starts) / counts)
        active = levels >= .005
        indices = np.flatnonzero(active)
        seconds = len(audio)/sr
        active_seconds = float(counts[active].sum()/sr)
        leading = float(starts[indices[0]]/sr) if len(indices) else seconds
        trailing = float((len(audio)-starts[indices[-1]]-counts[indices[-1]])/sr) if len(indices) else seconds
        span = max(0., seconds-leading-trailing)
        text = str(text)
        words = len(re.findall(r'\S+', text))
        clipping = float(np.mean(np.abs(audio) >= .995))
        return {'status': 'measured', 'valid': bool(active_seconds >= .15 and clipping <= .001),
                'seconds': seconds, 'leadingPause': leading, 'trailingPause': trailing,
                'speechSpan': span, 'activeSeconds': active_seconds, 'wordCount': words,
                'textHash': hashlib.sha256(text.encode('utf-8')).hexdigest(),
                'wordsPerSecond': words/span if span else 0., 'peak': peak,
                'clippingFraction': clipping}
    except (TypeError, ValueError, OverflowError):
        return invalid


def _window(value):
    return (isinstance(value, (int, float)) and not isinstance(value, bool)
            and math.isfinite(value) and 0 < value <= MAX_SECONDS)


def _reasons(metrics, target_window=None):
    if not metrics.get('valid'):
        return []  # Invalid acoustics already belong to the main quality gate.
    result = []
    if max(metrics['leadingPause'], metrics['trailingPause']) > .8:
        result.append('long-edge-pause')
    if metrics['wordCount'] >= 8 and metrics['speechSpan'] >= 1 and metrics['wordsPerSecond'] > 5.5:
        result.append('fast-speaking-pace')
    if metrics['wordCount'] >= 8 and metrics['speechSpan'] >= 5 and metrics['wordsPerSecond'] < .75:
        result.append('slow-speaking-pace')
    if _window(target_window) and metrics['seconds'] > target_window + .2:
        result.append('window-overflow')
    return result


def retry_reasons(wav, sr, text='', target_window=None):
    return _reasons(measure_samples(wav, sr, text), target_window)


def _verified(check):
    if not isinstance(check, dict):
        return False
    similarity = check.get('similarity')
    return (check.get('status') == 'passed' and check.get('review') is False
            and isinstance(check.get('recognizedText'), str) and bool(check['recognizedText'].strip())
            and isinstance(similarity, (int, float)) and not isinstance(similarity, bool)
            and math.isfinite(similarity) and 0 <= similarity <= 1
            and all(key in check and not check[key] for key in CONTENT_FLAGS))


def prefer_candidate(baseline, candidate, baseline_check, candidate_check, target_window=None):
    """Accept only measured improvement without acoustic/content regression.

    Inputs are unrounded measure_samples outputs and full SpeechVerifier.check
    dictionaries for the SAME expected spoken text. Return a reviewable reason.
    """
    def decision(accepted, reason):
        return {'accepted': accepted, 'reason': reason}
    try:
        if not baseline.get('valid') or not candidate.get('valid'):
            return decision(False, 'invalid-acoustics')
        keys = ('seconds', 'leadingPause', 'trailingPause', 'speechSpan', 'wordsPerSecond', 'clippingFraction')
        if any(not isinstance(m[k], (int, float)) or not math.isfinite(m[k]) or m[k] < 0
               for m in (baseline, candidate) for k in keys):
            return decision(False, 'invalid-metrics')
        if not _verified(baseline_check) or not _verified(candidate_check):
            return decision(False, 'full-asr-required')
        if candidate_check['similarity'] < baseline_check['similarity']:
            return decision(False, 'content-evidence-regressed')
        if baseline['wordCount'] != candidate['wordCount'] or baseline['textHash'] != candidate['textHash']:
            return decision(False, 'different-expected-text')
        if not _reasons(baseline, target_window):
            return decision(False, 'no-detected-risk')
        if candidate['clippingFraction'] > baseline['clippingFraction']:
            return decision(False, 'clipping-regressed')
        if candidate['seconds'] > baseline['seconds'] + .04:
            return decision(False, 'duration-regressed')
        if any(candidate[k] > baseline[k] + .04 for k in ('leadingPause','trailingPause')):
            return decision(False, 'edge-pause-regressed')
        if set(_reasons(candidate, target_window)) - set(_reasons(baseline, target_window)):
            return decision(False, 'new-rhythm-risk')
        overflow_improved = (_window(target_window) and baseline['seconds'] > target_window + .2
                             and baseline['seconds']-candidate['seconds'] >= .2)
        edges_improved = (max(baseline['leadingPause'], baseline['trailingPause']) > .8
                          and baseline['leadingPause']+baseline['trailingPause']
                          -candidate['leadingPause']-candidate['trailingPause'] >= .2)
        if overflow_improved:
            return decision(True, 'less-window-overflow')
        if edges_improved:
            return decision(True, 'shorter-edge-pauses')
        return decision(False, 'no-objective-improvement')
    except (AttributeError, KeyError, TypeError, ValueError, OverflowError):
        return decision(False, 'invalid-metrics')
