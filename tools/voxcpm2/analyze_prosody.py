"""Offline diagnostics for compare_continuity results; no quality ranking.

Run with the existing voice-engine Python (librosa is optional unless --pitch
is requested). No audio is modified and no recording is uploaded.
"""
import argparse
import json
from pathlib import Path
import re

import numpy as np
import soundfile as sf


def pitch_summary(values, speech_span):
    """Suppress summaries based on only a few apparently confident frames.

    pYIN's10ms frame hop is fixed below. At least500ms and10% of the
    speech span must be supported; silence-only input has no pitch summary.
    This conservative reporting floor is not a calibrated quality gate.
    """
    values = np.asarray(values, dtype=float)
    values = values[np.isfinite(values) & (values > 0)]
    sufficient = speech_span > 0 and len(values) >= max(50, int(np.ceil(speech_span*10)))
    result = {'pitch_confident_frames': int(len(values)),
              'pitch_span_coverage': round(min(1, len(values)*.01/speech_span),4) if speech_span > 0 else 0,
              'pitch_sufficient': bool(sufficient),
              'f0_median_hz': None, 'f0_range_90_10_semitones': None}
    if sufficient:
        semitones = 12*np.log2(values/55)
        result['f0_median_hz'] = round(float(np.median(values)),3)
        result['f0_range_90_10_semitones'] = round(float(np.percentile(semitones,90)-np.percentile(semitones,10)),3)
    return result


def measure(audio, sr, text, pitch=False):
    wav = np.asarray(audio, dtype=np.float32)
    if wav.ndim != 1 or not 8000 <= sr <= 192000 or not 0 < len(wav) <= 30*sr or not np.isfinite(wav).all():
        raise ValueError('Use finite mono speech of at most 30 seconds, at 8 kHz or above.')
    step = max(1, round(sr*.02))
    rms = np.array([np.sqrt(np.mean(wav[i:i+step]**2)) for i in range(0, len(wav), step)])
    active = np.flatnonzero(rms > max(.002, float(rms.max())*.025))
    span = min(len(wav)/sr, (active[-1]+1)*step/sr)-active[0]*step/sr if len(active) else 0
    words = len(re.findall(r"[^\W_]+(?:['’][^\W_]+)?", text))
    levels = rms[active]
    result = {'duration_seconds': round(len(wav)/sr, 4),
              'speech_span_seconds': round(float(span), 4),
              'words_per_second_span': round(words/span, 4) if span else None,
              'active_rms_dbfs': round(float(20*np.log10(max(float(np.median(levels)), 1e-9))), 3) if len(levels) else None,
              'quiet_fraction': round(float(1-len(active)/len(rms)), 4)}
    if pitch:
        import librosa
        y = librosa.resample(wav, orig_sr=sr, target_sr=16000)
        f0, voiced, probability = librosa.pyin(y, sr=16000, fmin=55, fmax=550,
                                             frame_length=1024, hop_length=160)
        # Exclude digital silence and low-confidence frames; the estimates can
        # still contain octave errors. F0 is not a speaker-identity embedding.
        energy = librosa.feature.rms(y=y, frame_length=1024, hop_length=160)[0]
        valid = voiced & np.isfinite(f0) & (probability >= .5) & (energy > max(.002, float(energy.max())*.025))
        result.update(pitch_summary(f0[valid], span))
    return result


def analyze(source, output, pitch=False):
    document = json.loads(source.read_text(encoding='utf-8-sig'))
    cases = document.get('cases')
    if not isinstance(cases, list) or not 1 <= len(cases) <= 8:
        raise ValueError('Expected 1–8 comparison cases.')
    root, rows = source.parent.resolve(), []
    for index, case in enumerate(cases):
        if not isinstance(case.get('text'), str) or not 1 <= len(case['text']) <= 300:
            raise ValueError('Invalid comparison text.')
        variants = case.get('variants')
        if not isinstance(variants, list) or not 1 <= len(variants) <= 4:
            raise ValueError('Expected 1–4 variants per case.')
        records = []
        for variant in variants:
            name = variant.get('file')
            if not isinstance(name, str) or Path(name).name != name or not name.lower().endswith('.wav'):
                raise ValueError('Expected a local WAV filename.')
            path = (root/name).resolve()
            if path.parent != root:
                raise ValueError('Audio must remain inside the comparison directory.')
            info = sf.info(path)
            if info.channels != 1 or not 0 < info.duration <= 30 or not 8000 <= info.samplerate <= 192000:
                raise ValueError('Invalid comparison WAV.')
            wav, sr = sf.read(path, dtype='float32')
            records.append({'variant': variant.get('name'), 'file': name,
                            **measure(wav, sr, case['text'], pitch)})
        rows.append({'case': index+1, 'variants': records})
    result = {'version': 1, 'pitch': bool(pitch), 'cases': rows,
              'pitch_settings': {'method': 'librosa.pyin', 'sample_rate': 16000,
                                 'fmin': 55, 'fmax': 550, 'frame_length': 1024,
                                 'hop_length': 160, 'minimum_probability': .5,
                                 'minimum_confident_seconds': .5,
                                 'minimum_span_coverage': .1} if pitch else None,
              'limitations': 'Energy activity and pYIN are diagnostics, not VAD, speaker similarity, MOS or a naturalness ranking. Rate includes internal pauses. Pitch range may include octave errors; speech style may legitimately vary.'}
    with output.open('x', encoding='utf-8') as stream:
        json.dump(result, stream, ensure_ascii=False, indent=2, allow_nan=False)
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--results', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--pitch', action='store_true')
    args = parser.parse_args()
    analyze(args.results, args.output, args.pitch)
