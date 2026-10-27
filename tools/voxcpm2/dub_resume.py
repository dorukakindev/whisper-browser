"""Recover real completed speech after bounded engine recovery is exhausted."""
from pathlib import Path

import numpy as np
import soundfile as sf
from dub_quality import cached_record, valid_audio


def recover_completed(args, cues, paths):
    good = [p for p in paths if valid_audio(p, sf)]
    if not good:
        return None  # Never call an entirely silent file successful speech.
    sr = sf.info(good[0]).samplerate
    if any(sf.info(p).samplerate != sr for p in good):
        return None
    rows = []
    for i, ((_, _, text), path) in enumerate(zip(cues, paths)):
        row = {'group':i+1, 'key':args.group_keys[i], 'text':text}
        if valid_audio(path,sf):
            row.update(cached_record(path))
            if args.group_keys[i] in args.force_groups:
                row.update(status='review', regenerationFailed=True)
        else:
            # A single zero sample reserves the time window in either timeline
            # builder. Missing speech is explicitly failed and never cacheable.
            fallback = Path(args.report_dir)/f'unfinished_{i:04d}.wav'
            sf.write(fallback,np.zeros(1,dtype=np.float32),sr,subtype='PCM_16')
            paths[i] = fallback
            row.update(status='failed', verification={'status':'unavailable'},
                       recoveryReason='engine_unavailable')
        rows.append(row)
    args.group_results = rows
    if any(row['status'] == 'failed' for row in rows):
        print('DUB_WARNING incomplete_audio',flush=True)
    print(f'[{len(rows)}/{len(rows)}]',flush=True)
    return sr
