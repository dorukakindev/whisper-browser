"""Measure adjacent speech and gently level outliers without touching raw caches."""
from contextlib import contextmanager
from pathlib import Path
import math
import re
import tempfile
import numpy as np
import soundfile as sf


def measure(path, text=''):
    try:
        return _measure(path, text)
    except (OSError, RuntimeError, ValueError):
        return {'status': 'unavailable'}


def _measure(path, text=''):
    audio, rate = sf.read(path, dtype='float32', always_2d=True)
    if not len(audio) or not np.isfinite(audio).all():
        return {'status': 'unavailable'}
    width = max(1, round(rate * .02))
    energy = np.mean(audio.astype(np.float64) ** 2, axis=1)
    complete = len(energy) // width
    frame = np.sqrt(energy[:complete * width].reshape(-1, width).mean(axis=1)) if complete else np.array([])
    if len(energy) % width:
        frame = np.append(frame, math.sqrt(float(energy[complete * width:].mean())))
    active = frame >= .005
    voiced = frame[active]
    peak = float(np.max(np.abs(audio)))
    level = float(np.percentile(voiced, 65)) if len(voiced) else 0
    duration = len(audio) / rate
    indices = np.flatnonzero(active)
    leading = min(duration, float(indices[0]) * .02) if len(indices) else duration
    trailing = max(0, duration - (int(indices[-1]) + 1) * .02) if len(indices) else duration
    return {'status': 'measured', 'seconds': round(duration, 3), 'voicedSeconds': round(float(active.sum()) * .02, 3),
            'levelDb': round(20 * math.log10(level), 2) if level > 0 else None,
            'peak': round(peak, 5), 'leadingPause': round(leading, 3), 'trailingPause': round(trailing, 3),
            'wordsPerSecond': round(len(re.findall(r"\S+", text)) / max(.1, duration-leading-trailing), 2),
            'gainDb': 0.0, 'warnings': []}


@contextmanager
def prepare(paths, texts, *, enabled=False, directory=None):
    metrics = [measure(path, text) for path, text in zip(paths, texts)]
    levels = [m['levelDb'] for m in metrics if m.get('levelDb') is not None]
    median = float(np.median(levels)) if levels else None
    with tempfile.TemporaryDirectory(prefix='continuity-', dir=directory) as temporary:
        rendered = list(paths)
        for i, m in enumerate(metrics):
            if m.get('status') != 'measured':
                continue
            if m['leadingPause'] > .8 or m['trailingPause'] > .8:
                m['warnings'].append('long-edge-pause')
            previous = metrics[i-1] if i else None
            if previous and previous.get('levelDb') is not None and m['levelDb'] is not None:
                if abs(m['levelDb'] - previous['levelDb']) > 6:
                    m['warnings'].append('level-jump')
                speed = previous.get('wordsPerSecond', 0)
                if min(speed, m['wordsPerSecond']) > 0 and max(speed, m['wordsPerSecond']) / min(speed, m['wordsPerSecond']) > 1.8:
                    m['warnings'].append('pace-jump')
            neighbours = [metrics[j].get('levelDb') for j in (i-1,i+1) if 0 <= j < len(metrics)]
            outlier = m['levelDb'] is not None and median is not None and abs(m['levelDb']-median) > 4 and any(v is not None and abs(v-m['levelDb']) > 6 for v in neighbours)
            if not enabled or not outlier:
                continue
            gain = max(-2.0, min(2.0, median-m['levelDb']))
            scale = min(10 ** (gain / 20), .97 / max(.00001,m['peak']))
            # Never apply an unbounded attenuation because a file contains a transient peak.
            scale = max(10 ** (-2 / 20), scale)
            audio, rate = sf.read(paths[i], dtype='float32')
            adjusted = audio * scale
            if not np.isfinite(adjusted).all() or float(np.max(np.abs(adjusted))) >= 1:
                continue
            target = Path(temporary) / (str(i)+'.wav')
            try:
                sf.write(target, adjusted, rate, subtype='FLOAT')
            except (OSError, RuntimeError, ValueError):
                m['warnings'].append('level-correction-unavailable')
                continue
            rendered[i] = target
            m['gainDb'] = round(20 * math.log10(scale), 2)
        yield rendered, metrics
