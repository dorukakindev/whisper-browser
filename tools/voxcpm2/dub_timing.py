"""Sentence planning and explicit timing outcomes; no model dependency."""
import re
import json
import asyncio
import math
import subprocess
from pathlib import Path

import numpy as np
from dub_timeline_storage import DiskTimeline
import soundfile as sf
from dub_lifecycle import bounded_call, EngineStalled


# A speaker turn starts with a dash, a [label], or a short NAME label ('JOHN:',
# 'Dr. Kaya:', 'Anlatıcı:'). A name is made of capitalised words; any colon in the
# first 25 characters used to count, so a narrator sentence such as 'Şöyle
# düşünün: bir adam yürüyor' was cut out of its sentence as if someone new spoke.
_LABEL_WORD = r"[A-ZÇĞİÖŞÜ][\wÇĞİÖŞÜçğıöşü.'’-]*"
SPEAKER_TURN = re.compile(r'^\s*(?:[-\u2013\u2014]\s|\[[^\]]+\]|' + _LABEL_WORD
                          + r'(?:(?:\s+(?:bin|bint|van|von|de|del|der|da|di))?\s+' + _LABEL_WORD + r'){0,2}:\s)')


def is_speaker_turn(text):
    return bool(SPEAKER_TURN.match(text))


class TimingOverflow(ValueError):
    def __init__(self, report):
        self.report = report
        super().__init__(f"Ses pencereye sigmadi: {report['overrun_seconds']:.2f} sn tasma. "
                         "Ses kesilmedi; raporu inceleyin veya acikca --tasarsa kirp secin.")


async def quality_retry(generate, assess, seed, retries=2, timeout=180):
    """Retry acoustic failures only; fitting duration is a separate operation."""
    best, best_score, attempts = None, math.inf, 0
    for attempt in range(retries + 1):
        attempts += 1
        try:
            raw = await bounded_call(generate(seed + attempt * 100003), timeout)
        except (asyncio.TimeoutError, OSError, RuntimeError, ValueError) as error:
            if isinstance(error, EngineStalled):
                raise
            if any(term in str(error).lower() for term in ('out of memory', 'cuda error')):
                raise
            # A later failed retry must not erase an already usable candidate.
            if best is not None:
                break
            if attempt == retries:
                raise
            continue
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


def _balanced_flow(cues, max_chars, max_seconds, max_gap_ms):
    """Pack contiguous narration into few, balanced, sentence-aware requests.

    Duration/size are hard limits between cues. A single source cue is never
    truncated. At most 128 candidates per position bound dense-caption cost.
    """
    def speaker(text):
        return is_speaker_turn(text)

    def completed(text):
        tail = text.rstrip().rstrip('"\u201d\u2019\u00bb)]')
        abbreviation = re.search(r'(?:\b(?:Dr|Prof|Doç|Sn|Mr|Mrs|Ms|vb|vs)|\b[A-ZÇĞİÖŞÜ]|\d)\.$', tail, re.I)
        return bool(re.search(r'[.!?]$', tail)) and not tail.endswith('...') and not abbreviation

    runs, run = [], []
    for i, cue in enumerate(cues):
        if run and (cue[0] < run[-1][1][1] or cue[0]-run[-1][1][1] > max_gap_ms
                    or speaker(cue[2]) or speaker(run[-1][1][2])):
            runs.append(run); run = []
        run.append((i+1, cue))
    if run:
        runs.append(run)
    groups = []
    for run in runs:
        n = len(run)
        # Avoid a mid-sentence reset before minimizing request count. Packing
        # six half-sentences into two requests can split a sentence in both;
        # three complete requests preserve the intended phrasing instead.
        # Size/duration/speaker limits still take precedence over this choice.
        costs, ends = [(0, 0, 0.0)]*(n+1), [0]*n
        for i in range(n-1, -1, -1):
            best, size, stop = None, 0, run[i][1][1]
            for j in range(i, min(n, i+128)):
                cue = run[j][1]
                size += len(cue[2].strip()) + (1 if j > i else 0)
                stop = max(stop, cue[1])
                if j > i and (size > max_chars or (stop-run[i][1][0])/1000 > max_seconds):
                    break
                penalty = (size/max(1, max_chars))**2
                unfinished = int(j+1 < n and not completed(cue[2]))
                candidate = (unfinished+costs[j+1][0], 1+costs[j+1][1],
                             penalty+costs[j+1][2])
                if best is None or candidate < best:
                    best, ends[i] = candidate, j+1
            costs[i] = best
        i = 0
        while i < n:
            selected = run[i:ends[i]]
            groups.append({'start': selected[0][1][0], 'end': max(c[1][1] for c in selected),
                           'text': ' '.join(c[1][2].strip() for c in selected),
                           'source_ids': [c[0] for c in selected]})
            i = ends[i]
    return groups


def sentence_plan(cues, mode="cumle", max_chars=250, max_seconds=12, max_gap_ms=600):
    """Preserve every source cue; group only nearby, same-speaker text."""
    if mode not in ("cumle", "satir", "akici"):
        raise ValueError("Bilinmeyen gruplama modu")
    if mode == 'akici':
        for i, (start, end, text) in enumerate(cues):
            if start < 0 or end <= start or not text.strip() or (i and start < cues[i-1][0]):
                raise ValueError(f"Gecersiz altyazi satiri: {i+1}")
        # Preserve the established simultaneous-cue convention rather than
        # speaking overlapping captions in separate requests.
        if not any(i and c[0] == cues[i-1][0] for i, c in enumerate(cues)):
            return _balanced_flow(cues, max_chars, max_seconds, max_gap_ms)
    groups = []
    for i, (start, end, text) in enumerate(cues):
        if start < 0 or end <= start or not text.strip():
            raise ValueError(f"Gecersiz altyazi satiri: {i + 1}")
        if i and start < cues[i - 1][0]:
            raise ValueError("Altyazi zamanlari sirali olmali")
        if groups and start == groups[-1]['start']:
            # One narrator reads simultaneous cues in source order, retaining IDs.
            g = groups[-1]
            g['end'] = max(g['end'], end)
            g['text'] += ' ' + text.strip()
            g['source_ids'].append(i + 1)
            continue
        split = mode == "satir" or not groups
        if groups and not split:
            g = groups[-1]
            tail = g['text'].rstrip('"\u201d\u2019\u00bb)]')
            abbreviation = bool(re.search(r'(?:\b(?:Dr|Prof|Doç|Sn|Mr|Mrs|Ms|vb|vs)|\b[A-ZÇĞİÖŞÜ]|\d)\.$', tail, re.I))
            complete = bool(re.search(r'[.!?]$', tail)) and not tail.endswith('...') and not abbreviation
            speaker_boundary = is_speaker_turn(text)
            previous_speaker = is_speaker_turn(g['text'])
            split = (start - g['end'] > max_gap_ms or start < g['end'] or speaker_boundary
                     or len(g['text']) + len(text) + 1 > max_chars
                     or (max(end, g['end']) - g['start']) / 1000 > max_seconds
                     # Keep very short replies with their context; otherwise
                     # end a completed sentence before the next source cue.
                     or (mode == 'akici' and previous_speaker)
                     or (complete and (len(g['text']) >= 140 if mode == 'akici' else len(text.strip()) >= 24)))
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


def tempo_filter(ratio):
    """Keep every atempo stage <=2: larger single steps can skip speech samples."""
    if not math.isfinite(ratio) or ratio < 1:
        raise ValueError('Invalid tempo.')
    stages = []
    while ratio > 2:
        stages.append('atempo=2.000000')
        ratio /= 2
    stages.append(f'atempo={ratio:.6f}')
    return ','.join(stages)


def fit_to_window(wav, sr, window_s, max_speed, tmp_dir, tag, overflow="hata"):
    """Return audio AND metrics; clipping requires explicit opt-in."""
    if not all(math.isfinite(n) for n in (sr, window_s, max_speed)) or sr <= 0 or window_s <= 0 or max_speed < 1 or overflow not in ('hata', 'kirp', 'uzat'):
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
                result = subprocess.run(['ffmpeg', '-nostdin', '-y', '-v', 'error', '-i', str(src),
                    '-af', tempo_filter(tempo), str(dst)], capture_output=True,
                    timeout=max(30., min(180., before * 3)),
                    creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
                if result.returncode:
                    raise RuntimeError("FFmpeg tempo islemi basarisiz")
                fitted, rate = sf.read(str(dst), dtype='float32')
                if rate != sr or fitted.ndim != 1 or not len(fitted) or not np.isfinite(fitted).all():
                    raise RuntimeError("Tempo islemi gecersiz ses uretti")
                wav = fitted
                report['tempo'] = tempo
            except (OSError, ValueError, RuntimeError, subprocess.TimeoutExpired) as error:
                if overflow != 'uzat':
                    raise  # Fixed/strict timing must never silently overflow.
                # Adaptive video can slow down instead. Keep every original
                # sample; mark the fallback for review rather than lose all audio.
                report['tempo_error'] = 'timeout' if isinstance(error, subprocess.TimeoutExpired) else 'conversion_failed'
                print('DUB_WARNING tempo_fallback', flush=True)
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
    if not cues or len(cues) != len(paths):
        raise ValueError('Speech group/audio count mismatch / Konusma grubu ve ses parcasi sayisi uyusmuyor.')
    storage, segments, reports = DiskTimeline(tmp_dir), [], []
    video_cursor = 0.0
    audio_frames = 0
    for i, ((start_ms, _, _), path) in enumerate(zip(cues, paths)):
        start = start_ms / 1000
        window = available_window(cues, i, extra_ms, total_s * 1000)
        gap = max(0, round((start - video_cursor) * sr))
        if gap:
            storage.silence(gap); audio_frames += gap
        wav, rate = sf.read(str(path), dtype='float32')
        if rate != sr or wav.ndim != 1:
            raise ValueError('Ses parcasi ornek hizi/kanali uyumsuz.')
        wav, report = fit_to_window(wav, sr, window, max_speed, tmp_dir, f'adaptive_{i}', 'uzat')
        window_frames = max(round(window * sr), len(wav))
        a0 = audio_frames / sr
        storage.append(wav); audio_frames += len(wav)
        if window_frames > len(wav):
            storage.silence(window_frames - len(wav))
            audio_frames += window_frames - len(wav)
        stop = start + window
        segments.append({'v0': start, 'v1': stop, 'a0': a0, 'a1': audio_frames / sr})
        report.update(group=i + 1, start_seconds=a0, start_shift_seconds=0.0,
                      stretch=max(1.0, window_frames / sr / window))
        reports.append(report); video_cursor = stop
    tail = max(0, round((total_s - video_cursor) * sr))
    if tail: storage.silence(tail)
    audio = storage.finish()
    sync = {'version': 1, 'smooth': True, 'videoDuration': total_s, 'audioDuration': len(audio) / sr, 'segments': segments}
    timing = {'version': 3, 'accelerated_groups': sum(r['tempo'] > 1 for r in reports),
              'clipped_groups': 0, 'overflow_groups': 0,
              'stretched_groups': sum(r['stretch'] > 1.001 for r in reports), 'groups': reports}
    return audio, timing, sync


def build_narration_timeline(cues, paths, sr, tmp_dir=None):
    """Continuous book narration, retaining breaths and source group identities."""
    if not cues or len(cues) != len(paths):
        raise ValueError('Speech group/audio count mismatch / Konusma grubu ve ses parcasi sayisi uyusmuyor.')
    from dub_finish import join_pause_frames
    storage, rows, cursor, previous = DiskTimeline(tmp_dir), [], 0, None
    for i, (cue, file) in enumerate(zip(cues, paths)):
        wav, rate = sf.read(str(file), dtype='float32')
        if rate != sr or wav.ndim != 1 or not len(wav) or not np.isfinite(wav).all():
            raise ValueError('Invalid narration audio.')
        if previous is not None:
            gap = join_pause_frames(previous, wav, sr, cues[i-1][2])
            storage.silence(gap); cursor += gap
        rows.append({'start_seconds':cursor/sr, 'after_seconds':len(wav)/sr,
                     'before_seconds':len(wav)/sr, 'tempo':1., 'cut_frames':0,
                     'overrun_seconds':0., 'stretch':1.})
        storage.append(wav); cursor += len(wav); previous = wav
    return storage.finish(), {'groups':rows, 'accelerated_groups':0,
        'clipped_groups':0, 'overflow_groups':0, 'mode':'narration'}


def build_fixed_timeline(cues, paths, sr, total_s, max_hiz, tmp_dir, log=print,
                   overflow="kirp", extra_ms=2000, end_limit_ms=None, lead_ms=300):
    """Uretilmis satir seslerini zaman cizelgesine yerlestirir."""
    from dub_timeline_storage import DiskTimeline, limit_peak
    total_frames = int(math.ceil(total_s * sr))
    storage = DiskTimeline(tmp_dir)
    storage.silence(total_frames)
    timeline = storage.finish()
    sigdirildi = kirpildi = 0
    reports, overflows = [], []
    previous_end_s = 0
    for i, ((start_ms, end_ms, text), path) in enumerate(zip(cues, paths)):
        wav, cue_sr = sf.read(str(path), dtype="float32")
        if cue_sr != sr:
            frames = int(len(wav) * sr / cue_sr)
            wav = np.interp(np.linspace(0, len(wav) - 1, frames),
                            np.arange(len(wav)), wav).astype(np.float32)
        actual_start, stop = placement_window(cues, i, len(wav) / sr, previous_end_s,
            max_hiz, extra_ms, lead_ms, end_limit_ms if end_limit_ms is not None else total_s * 1000)
        window_s = stop - actual_start
        try:
            wav, report = fit_to_window(wav, sr, window_s, max_hiz, tmp_dir, f"{i:04d}", overflow)
        except TimingOverflow as error:
            report = error.report
            report['group'] = i + 1
            reports.append(report); overflows.append(report)
            sigdirildi += int(report['tempo'] > 1.0)
            log(f"UYARI: Grup {i + 1}, {report['overrun_seconds']:.2f} sn tasiyor; konusma kesilmedi.")
            continue
        report['group'] = i + 1
        report['start_seconds'] = actual_start
        report['start_shift_seconds'] = actual_start - start_ms / 1000
        reports.append(report)
        sigdirildi += int(report['tempo'] > 1.0)
        kirpildi += int(report['cut_frames'] > 0)
        if report['cut_frames'] > 0:
            log(f"UYARI: Grup {i + 1}, {report['cut_frames'] / sr:.2f} sn kirpildi; WAV uretimi devam ediyor.")
        offset = int(actual_start * sr)
        end = min(offset + len(wav), total_frames)
        timeline[offset:end] += wav[:end - offset]
        previous_end_s = end / sr
    timing = {'version': 2, 'accelerated_groups': sigdirildi, 'clipped_groups': kirpildi,
              'overflow_groups': len(overflows), 'groups': reports}
    (Path(tmp_dir) / 'timing_report.json').write_text(json.dumps(timing, indent=2), encoding='utf-8')
    log(f"Zamanlama: {sigdirildi} grup hizlandirildi, {kirpildi} grup kirpildi, {len(overflows)} grup tasiyor.")
    if overflows:
        raise ValueError(f"{len(overflows)} grup pencereye sigmadi; nihai WAV yazilmadi. "
                         f"Ayrintilar: {Path(tmp_dir) / 'timing_report.json'}")
    limit_peak(timeline)
    return timeline, timing
