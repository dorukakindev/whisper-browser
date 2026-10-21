"""Bounded content recovery after ASR rejects a long utterance twice."""
import asyncio
import re

import numpy as np
import soundfile as sf


def recovery_blocks(text, limit=260):
    """Split at sentence/clause boundaries, never remove or rewrite words."""
    words = text.split()
    if not words:
        return []
    if len(text) <= limit:
        return [' '.join(words)]
    # Split near the middle to avoid a long first piece and a tiny last piece.
    midpoint = len(text)/2
    positions = [m.start() for m in re.finditer(r'\s+', text)]
    preferred = [p for p in positions if text[:p].rstrip().endswith(('.', '!', '?', ';', ':', ','))
                 and not re.search(r'\b(?:Dr|Prof|Mr|Mrs|Ms|Sn|vb|vs)\.$', text[:p], re.I)
                 and len(text)*.2 <= p <= len(text)*.8]
    cut = min(preferred or positions, key=lambda p: abs(p-midpoint), default=None)
    if cut is None:  # An indivisible token is not damaged to meet a size target.
        return [text]
    return recovery_blocks(text[:cut].strip(), limit) + recovery_blocks(text[cut:].strip(), limit)


async def recover_long_speech(text, numeric_reference, seed, sr, generate, finish,
                              verify, temporary, timeout, on_attempt=lambda: None):
    """Return a fully checked repair or None; retain the caller's original audio.

    Same reference conditioning is supplied by generate's caller for every part.
    Do not chain generated audio back into the next prompt: errors would propagate.
    """
    if len(text) <= 280:
        return None
    blocks = recovery_blocks(text)
    if not 2 <= len(blocks) <= 8:
        return None
    target = temporary.with_name(temporary.stem+'-recovery.wav')
    waves, finishing = [], []
    try:
        for block in blocks:
            on_attempt()
            raw = await asyncio.wait_for(generate(block, seed+500003), timeout)
            wav, finished = finish(raw, sr)
            finishing.append(finished)
            sf.write(target, wav, sr, subtype='PCM_16')
            check = await verify(target, block, numeric_reference=block)
            if check.get('status') != 'passed':
                return None
            if waves:
                waves.append(np.zeros(round(.08*sr), dtype=np.float32))
            waves.append(wav)
        joined = np.concatenate(waves)
        sf.write(target, joined, sr, subtype='PCM_16')
        check = await verify(target, text, numeric_reference=numeric_reference)
        if check.get('status') != 'passed':
            return None
        return joined, check, {'chunks': len(blocks), 'verified': True, 'finishing': finishing}
    except (ValueError, OSError, asyncio.TimeoutError):
        return None
    finally:
        target.unlink(missing_ok=True)
