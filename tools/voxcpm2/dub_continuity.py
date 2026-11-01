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
def prepare(paths, texts, *, enabled=False, directory=None, groups=None, scene_gap_ms=8000):
    """Render conservative level corrections within source scenes.

    Optional group start/end (or packed-preview source_start/source_end) are
    milliseconds, as in dub_plan. Supplying groups must cover every audio row.
    """
    paths, texts = list(paths), list(texts)
    if len(paths) != len(texts):
        raise ValueError('Continuity audio/text counts differ.')
    scenes = [0] * len(paths)
    if groups is not None:
        groups = list(groups)
        if len(groups) != len(paths):
            raise ValueError('Continuity audio/group counts differ.')
        if isinstance(scene_gap_ms, bool) or not isinstance(scene_gap_ms, (int, float)) or not math.isfinite(scene_gap_ms) or scene_gap_ms <= 0:
            raise ValueError('Invalid continuity scene gap.')
        previous_end, previous_speaker, scene = None, '', 0
        for i, group in enumerate(groups):
            if not isinstance(group, dict):
                raise ValueError('Invalid continuity group.')
            start, end = group.get('source_start', group.get('start')), group.get('source_end', group.get('end'))
            if any(isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v) for v in (start, end)) or start < 0 or end <= start:
                raise ValueError('Invalid continuity group timing.')
            speaker = str(group.get('speaker') or '').strip()
            if previous_end is not None and (start - previous_end >= scene_gap_ms or
                    (speaker and previous_speaker and speaker != previous_speaker)):
                scene += 1
            scenes[i] = scene
            previous_end, previous_speaker = end, speaker
    metrics = [measure(path, text) for path, text in zip(paths, texts)]
    scene_levels = {scene: [] for scene in scenes}
    for i, m in enumerate(metrics):
        if m.get('levelDb') is not None:
            scene_levels[scenes[i]].append(m['levelDb'])
    medians = {scene: float(np.median(levels)) if levels else None
               for scene, levels in scene_levels.items()}
    with tempfile.TemporaryDirectory(prefix='continuity-', dir=directory) as temporary:
        rendered = list(paths)
        for i, m in enumerate(metrics):
            if m.get('status') != 'measured':
                continue
            if m['leadingPause'] > .8 or m['trailingPause'] > .8:
                m['warnings'].append('long-edge-pause')
            median = medians[scenes[i]]
            previous = metrics[i-1] if i and scenes[i-1] == scenes[i] else None
            if previous and previous.get('levelDb') is not None and m['levelDb'] is not None:
                if abs(m['levelDb'] - previous['levelDb']) > 6:
                    m['warnings'].append('level-jump')
                speed = previous.get('wordsPerSecond', 0)
                if min(speed, m['wordsPerSecond']) > 0 and max(speed, m['wordsPerSecond']) / min(speed, m['wordsPerSecond']) > 1.8:
                    m['warnings'].append('pace-jump')
            neighbours = [metrics[j].get('levelDb') for j in (i-1,i+1) if 0 <= j < len(metrics) and scenes[j] == scenes[i]]
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
