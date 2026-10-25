"""Bounded optional two-pass loudness normalization; original speech is the fallback."""
import json
import math
import os
from pathlib import Path
import subprocess
import uuid

import soundfile as sf


def loudnorm_audio(wav_path, target_i=-20.0, target_tp=-2.0, target_lra=11.0, *, runner=subprocess.run):
    source=Path(wav_path)
    temporary=source.with_name(source.stem+".norm-"+uuid.uuid4().hex+".tmp.wav")
    try:
        original=sf.info(source)
        # Per-pass bound scales with real audio duration; never an unbounded final stage.
        timeout=min(1800,max(30,original.duration*.5+30))
        spec=f"loudnorm=I={target_i}:TP={target_tp}:LRA={target_lra}"
        options=dict(capture_output=True,text=True,encoding="utf-8",errors="replace",timeout=timeout,
                     creationflags=getattr(subprocess,"CREATE_NO_WINDOW",0))
        probe=runner(["ffmpeg","-hide_banner","-nostdin","-nostats","-i",str(source),"-af",spec+":print_format=json","-f","null","-"],**options)
        if probe.returncode: return None
        tail=probe.stderr or ""
        start=tail.rfind("{")
        stats=json.JSONDecoder().raw_decode(tail[start:])[0] if start>=0 else {}
        keys=("input_i","input_tp","input_lra","input_thresh","target_offset")
        if not all(key in stats and math.isfinite(float(stats[key])) for key in keys): return None
        measured=(":measured_I={input_i}:measured_TP={input_tp}:measured_LRA={input_lra}"
                  ":measured_thresh={input_thresh}:offset={target_offset}:linear=true").format(**stats)
        result=runner(["ffmpeg","-hide_banner","-nostdin","-nostats","-v","error","-y","-i",str(source),"-af",spec+measured,"-ar","48000","-c:a","pcm_s16le",str(temporary)],**options)
        if result.returncode or not temporary.is_file(): return None
        normalized=sf.info(temporary)
        if normalized.frames<=0 or normalized.channels!=original.channels or abs(normalized.duration-original.duration)>.1:return None
        # Atomic replacement only; locked files must not redirect output away from its timing map.
        os.replace(temporary,source)
        return source
    except (OSError,ValueError,TypeError,RuntimeError,subprocess.TimeoutExpired):
        return None
    finally:
        try: temporary.unlink(missing_ok=True)
        except OSError: pass
