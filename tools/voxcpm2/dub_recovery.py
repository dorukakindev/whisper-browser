"""Bounded content/acoustic repair after full-context speech retries fail."""
import asyncio
import math
import re

import numpy as np
import soundfile as sf
from dub_finish import join_pause_frames
from dub_lifecycle import bounded_call


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
    def boundary_rank(p):
        tail = text[:p].rstrip().rstrip('\"\u201d\u2019\u00bb)]')
        abbreviation = re.search(r'(?:\b(?:Dr|Prof|Doç|Mr|Mrs|Ms|Sn|vb|vs)|\b[A-ZÇĞİÖŞÜ]|\d)\.$', tail, re.I)
        if tail.endswith(('.', '!', '?')) and not tail.endswith('...') and not abbreviation:
            return 0
        return 1 if tail.endswith((';', ':', ',')) else 2
    central = [p for p in positions if len(text)*.2 <= p <= len(text)*.8]
    cut = min(central or positions, key=lambda p: (boundary_rank(p), abs(p-midpoint)), default=None)
    if cut is None:  # An indivisible token is not damaged to meet a size target.
        return [text]
    return recovery_blocks(text[:cut].strip(), limit) + recovery_blocks(text[cut:].strip(), limit)


async def recover_long_speech(text, numeric_reference, seed, sr, generate, finish,
                              verify, temporary, timeout, on_attempt=lambda: None, *, assess=None):
    """Return a fully checked repair or None; retain the caller's original audio.

    Same reference conditioning is supplied by generate's caller for every part.
    Do not chain generated audio back into the next prompt: errors would propagate.
    """
    # Default flowing groups are at most280 characters; they can lose words
    # too. Only failed groups are split, and never into tiny word-sized clips.
    if len(text) <= 140 or len(text.split()) < 12:
        return None
    blocks = recovery_blocks(text, limit=min(260, max(140, math.ceil(len(text)/2))))
    if (not 2 <= len(blocks) <= 8 or
            any(len(block) < 40 or len(block.split()) < 4 for block in blocks)):
        return None
    target = temporary.with_name(temporary.stem+'-recovery.wav')
    waves, finishing, joins = [], [], []
    try:
        for block in blocks:
            on_attempt()
            raw = await bounded_call(generate(block, seed+500003), timeout)
            # Correct words alone cannot approve clipping, bursts or a stalled
            # acoustic tail. Apply the same raw-audio gate as ordinary synthesis
            # before finishing can attenuate peaks and hide that evidence.
            if assess is not None:
                score = assess(raw, sr, block)
                if not math.isfinite(score) or score > 0:
                    return None
            wav, finished = finish(raw, sr)
            finishing.append(finished)
            sf.write(target, wav, sr, subtype='PCM_16')
            check = await verify(target, block, numeric_reference=block)
            if check.get('status') != 'passed' or check.get('review', False):
                return None
            if waves:
                frames = join_pause_frames(waves[-1], wav, sr, blocks[len(finishing)-2])
                joins.append(frames/sr)
                waves.append(np.zeros(frames, dtype=np.float32))
            waves.append(wav)
        joined = np.concatenate(waves)
        sf.write(target, joined, sr, subtype='PCM_16')
        check = await verify(target, text, numeric_reference=numeric_reference)
        if check.get('status') != 'passed' or check.get('review', False):
            return None
        return joined, check, {'chunks': len(blocks), 'verified': True,
                              'acoustic_checked': assess is not None,
                              'finishing': finishing, 'added_pauses_seconds': joins}
    except (ValueError, OSError, asyncio.TimeoutError):
        return None
    finally:
        target.unlink(missing_ok=True)
