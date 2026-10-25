"""Bound unusually long source cues before synthesis, keeping every word."""
import math
import numpy as np

from dub_finish import finish_audio, join_pause_frames
from dub_recovery import recovery_blocks

VERSION = 'bounded-utterance-v1'
MAX_CHARS = 420


def utterance_blocks(text):
    # Normal flowing groups already fit. Only oversized individual cues/manual
    # edits need this second boundary; source IDs and the video timeline stay put.
    return recovery_blocks(text, limit=MAX_CHARS)


async def synthesize_utterance(text, seed, sr, generate, assess):
    blocks = utterance_blocks(text)
    if len(blocks) <= 1:
        return await generate(text, seed), 0
    waves, worst_score = [], 0
    for i, block in enumerate(blocks):
        raw = await generate(block, seed)
        # Check raw audio before finishing could hide clipping or bursts.
        score = assess(raw, sr, block)
        worst_score = max(worst_score, score) if math.isfinite(score) else math.inf
        wav, _ = finish_audio(raw, sr, preserve_dynamics=True)
        if waves:
            pause = join_pause_frames(waves[-1], wav, sr, blocks[i - 1])
            waves.append(np.zeros(pause, dtype=np.float32))
        waves.append(wav)
    # Same clean reference and seed for each block; never feed generated speech
    # back as a prompt. Overall ASR still checks the complete original text.
    # Keep a usable candidate even when a block needs review. Carry its raw
    # score to the retry gate; finishing must not turn clipping into a pass.
    return np.concatenate(waves), worst_score
