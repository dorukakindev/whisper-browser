"""Sentence planning and explicit timing outcomes; no model dependency."""
import re
import asyncio
import math
import subprocess
from pathlib import Path

import numpy as np
import soundfile as sf


class TimingOverflow(ValueError):
    def __init__(self, report):
        self.report = report
        super().__init__(f"Ses pencereye sigmadi: {report['overrun_seconds']:.2f} sn tasma. "
                         "Ses kesilmedi; raporu inceleyin veya acikca --tasarsa kirp secin.")


async def quality_retry(generate, assess, seed, retries=2, timeout=180):
    """Retry acoustic failures only; fitting duration is a separate operation."""
    best, best_score, attempts = None, math.inf, 0
    for attempt in range(retries + 1):
        raw = await asyncio.wait_for(generate(seed + attempt * 100003), timeout)
        attempts += 1
        score = assess(raw)
        if math.isfinite(score) and score < best_score:
            best, best_score = raw, score
        if score == 0:
            break
    if best is None:
        raise ValueError("Model gecerli ses uretemedi.")
    return best, {'attempts': attempts, 'retries': attempts - 1, 'quality_score': best_score}


def placement_window(cues, i, audio_seconds, previous_end_s, max_speed,
                     extra_ms=2000, lead_ms=300, limit_ms=None):
    """Borrow actual preceding silence only when nominal timing needs it."""
    nominal = cues[i][0] / 1000
    stop = nominal + available_window(cues, i, extra_ms, limit_ms)
    if audio_seconds > (stop - nominal) * max_speed:
        start = max(0, nominal - lead_ms / 1000, previous_end_s)
        start = min(nominal, start)
    else:
        start = nominal
    return start, stop


def sentence_plan(cues, mode="cumle", max_chars=250, max_seconds=12, max_gap_ms=600):
    """Preserve every source cue; group only nearby, same-speaker text."""
    if mode not in ("cumle", "satir"):
        raise ValueError("Bilinmeyen gruplama modu")
    groups = []
    for i, (start, end, text) in enumerate(cues):
        if start < 0 or end <= start or not text.strip():
            raise ValueError(f"Gecersiz altyazi satiri: {i + 1}")
        if i and start < cues[i - 1][0]:
            raise ValueError("Altyazi zamanlari sirali olmali")
        split = mode == "satir" or not groups
        if groups and not split:
            g = groups[-1]
            tail = g['text'].rstrip('"\u201d\u2019\u00bb)]')
            abbreviation = bool(re.search(r'(?:\b(?:Dr|Prof|Doç|Sn|Mr|Mrs|Ms|vb|vs)|\b[A-ZÇĞİÖŞÜ]|\d)\.$', tail, re.I))
            complete = bool(re.search(r'[.!?]$', tail)) and not tail.endswith('...') and not abbreviation
            speaker_boundary = bool(re.match(r'^\s*(?:[-\u2013\u2014]\s|\[[^\]]+\]|[^:]{1,25}:\s)', text))
            split = (start - g['end'] > max_gap_ms or start < g['end'] or speaker_boundary
                     or len(g['text']) + len(text) + 1 > max_chars
                     or (max(end, g['end']) - g['start']) / 1000 > max_seconds
                     # Keep very short replies with their context; otherwise
                     # end a completed sentence before the next source cue.
                     or (complete and len(text.strip()) >= 24))
        if split:
            groups.append({'start': start, 'end': end, 'text': text.strip(), 'source_ids': [i + 1]})
        else:
            g = groups[-1]
            g['end'] = max(g['end'], end)
            g['text'] += ' ' + text.strip()
            g['source_ids'].append(i + 1)
    return groups


def available_window(cues, i, extra_ms=1000, limit_ms=None):
    start, end, _ = cues[i]
    stop = min(end + extra_ms, cues[i + 1][0]) if i + 1 < len(cues) else end + extra_ms
    if limit_ms is not None:
        stop = min(stop, limit_ms)
    if stop <= start:
        raise ValueError("Gruplar icin guvenli ses penceresi yok")
    return (stop - start) / 1000


def fit_to_window(wav, sr, window_s, max_speed, tmp_dir, tag, overflow="hata"):
    """Return audio AND metrics; clipping requires explicit opt-in."""
    if sr <= 0 or window_s <= 0 or max_speed < 1 or overflow not in ('hata', 'kirp', 'uzat'):
        raise ValueError("Gecersiz zamanlama secenegi")
    wav = np.asarray(wav, dtype=np.float32)
    before = len(wav) / sr
    ratio = before / window_s
    report = {'before_seconds': before, 'window_seconds': window_s,
              'tempo': 1.0, 'cut_frames': 0, 'silence_trim_frames': 0, 'overrun_seconds': 0.0}
    if ratio > 1.02:
        tempo = min(ratio, max_speed)
        if tempo > 1.001:
            src, dst = Path(tmp_dir) / f'fit_{tag}_src.wav', Path(tmp_dir) / f'fit_{tag}.wav'
            try:
                sf.write(str(src), wav, sr, subtype='PCM_16')
                result = subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', str(src),
                    '-af', f'atempo={tempo:.6f}', str(dst)], capture_output=True,
                    creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
                if result.returncode:
                    raise RuntimeError("FFmpeg tempo islemi basarisiz")
                wav, rate = sf.read(str(dst), dtype='float32')
                if rate != sr:
                    raise RuntimeError("Tempo islemi ornek hizini degistirdi")
                report['tempo'] = tempo
            finally:
                src.unlink(missing_ok=True); dst.unlink(missing_ok=True)
    frames = max(1, int(window_s * sr))
    excess = max(0, len(wav) - frames)
    report['overrun_seconds'] = excess / sr
    if excess and overflow != 'uzat':
        # Trimming genuinely silent padding is not cutting speech.
        silent = bool(np.max(np.abs(wav[frames:])) <= 0.001)
        if not silent and overflow == 'hata':
            raise TimingOverflow(report)
        report['silence_trim_frames' if silent else 'cut_frames'] = excess
        wav = wav[:frames].copy()
        if not silent:
            fade = min(int(.04 * sr), frames // 4)
            if fade:
                wav[-fade:] *= np.linspace(1, 0, fade, dtype=np.float32)
    report['after_seconds'] = len(wav) / sr
    return wav, report


def build_adaptive_timeline(cues, paths, sr, total_s, max_speed, tmp_dir, extra_ms=2000):
    """Keep full speech; expand audio windows and map original video to audio."""
    chunks, segments, reports = [], [], []
    video_cursor = 0.0
    audio_frames = 0
    for i, ((start_ms, _, _), path) in enumerate(zip(cues, paths)):
        start = start_ms / 1000
        window = available_window(cues, i, extra_ms, total_s * 1000)
        gap = max(0, round((start - video_cursor) * sr))
        if gap:
            chunks.append(np.zeros(gap, dtype=np.float32)); audio_frames += gap
        wav, rate = sf.read(str(path), dtype='float32')
        if rate != sr or wav.ndim != 1:
            raise ValueError('Ses parcasi ornek hizi/kanali uyumsuz.')
        wav, report = fit_to_window(wav, sr, window, max_speed, tmp_dir, f'adaptive_{i}', 'uzat')
        window_frames = max(round(window * sr), len(wav))
        a0 = audio_frames / sr
        chunks.append(wav); audio_frames += len(wav)
        if window_frames > len(wav):
            chunks.append(np.zeros(window_frames - len(wav), dtype=np.float32))
            audio_frames += window_frames - len(wav)
        stop = start + window
        segments.append({'v0': start, 'v1': stop, 'a0': a0, 'a1': audio_frames / sr})
        report.update(group=i + 1, start_seconds=a0, start_shift_seconds=0.0,
                      stretch=max(1.0, window_frames / sr / window))
        reports.append(report); video_cursor = stop
    tail = max(0, round((total_s - video_cursor) * sr))
    if tail: chunks.append(np.zeros(tail, dtype=np.float32))
    audio = np.concatenate(chunks) if chunks else np.zeros(1, dtype=np.float32)
    sync = {'version': 1, 'videoDuration': total_s, 'audioDuration': len(audio) / sr, 'segments': segments}
    timing = {'version': 3, 'accelerated_groups': sum(r['tempo'] > 1 for r in reports),
              'clipped_groups': 0, 'overflow_groups': 0,
              'stretched_groups': sum(r['stretch'] > 1.001 for r in reports), 'groups': reports}
    return audio, timing, sync
