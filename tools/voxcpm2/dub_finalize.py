"""Bounded constant-gain loudness adjustment preserving expressive dynamics."""
import json
import math
import os
from pathlib import Path
import subprocess

import soundfile as sf


def normalize_audio(path, run=None):
    path = Path(path)
    temporary = path.with_suffix('.norm.tmp.wav')
    run = run or subprocess.run
    try:
        info = sf.info(str(path))
        if info.frames <= 0 or info.samplerate <= 0:
            return False
        timeout = max(30, min(600, info.duration * 2 + 15))
        options = dict(capture_output=True, text=True, encoding='utf-8', errors='replace',
                       timeout=timeout, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
        spec = 'loudnorm=I=-20.0:TP=-2.0:LRA=11.0'
        probe = run(['ffmpeg', '-hide_banner', '-nostdin', '-i', str(path), '-af',
                     spec + ':print_format=json', '-f', 'null', '-'], **options)
        if probe.returncode != 0:
            return False
        text = probe.stderr or ''
        begin, end = text.rfind('{'), text.rfind('}')
        stats = json.loads(text[begin:end+1])
        names = ('input_i', 'input_tp')
        if not all(math.isfinite(float(stats[name])) for name in names):
            return False  # Silence / undefined measurements must not replace speech.
        # linear=true can silently revert to dynamic compression when source
        # LRA or true peak exceeds the target. Preserve the performance instead:
        # measure with R128, then apply one fixed gain to the whole recording.
        # True-peak headroom wins if -20 LUFS cannot be reached without limiting.
        gain_db = min(-20.0-float(stats['input_i']), -2.0-float(stats['input_tp']))
        adjustment = f'volume={gain_db:.6f}dB:precision=double'
        result = run(['ffmpeg', '-hide_banner', '-nostdin', '-y', '-i', str(path),
                      '-af', adjustment, '-ar', str(info.samplerate), '-c:a',
                      'pcm_s16le', str(temporary)], **options)
        if result.returncode != 0:
            return False
        normalized = sf.info(str(temporary))
        if (normalized.samplerate != info.samplerate or normalized.channels != info.channels
                or abs(normalized.frames-info.frames) > max(1, round(info.samplerate*.005))):
            return False  # A truncated but decodable WAV is not a successful pass.
        # Never fall back to a different name: sync/quality/project paths belong
        # to this exact output. A Windows lock leaves the original WAV intact.
        os.replace(temporary, path)
        return True
    except (OSError, ValueError, RuntimeError, KeyError, TypeError, subprocess.TimeoutExpired):
        return False
    finally:
        try:
            temporary.unlink(missing_ok=True)
        except OSError:
            pass  # The Node job also owns this specific partial path.
