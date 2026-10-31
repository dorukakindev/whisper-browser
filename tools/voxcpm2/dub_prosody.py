"""Conservative acoustic delivery tracking; not a categorical emotion detector."""
import numpy as np
import json
from pathlib import Path

VERSION = 'acoustic-delivery-v2'


def load_plan(file, source_hash, groups):
    if not file:
        return [None for _ in groups]
    path=Path(file)
    if path.stat().st_size > 2_000_000:
        raise ValueError('Delivery map too large')
    doc=json.loads(path.read_text(encoding='utf-8'))
    if doc.get('version')!=VERSION or doc.get('sourceHash')!=source_hash or not isinstance(doc.get('groups'),list):
        raise ValueError('Delivery source mismatch')
    rows={}
    for row in doc['groups']:
        key=row.get('key')
        if key in rows: raise ValueError('Duplicate delivery group')
        delivery_instruction(row.get('delivery'))
        rows[key]=row
    values=[]
    for group in groups:
        key=','.join(map(str,group['source_ids']))
        row=rows.get(key)
        if row and (row['start']!=group['start'] or row['end']!=group['end']):
            raise ValueError('Delivery timeline mismatch')
        values.append(row.get('delivery') if row else None)
    return values


def features(samples, rate=8000):
    audio = np.asarray(samples, dtype=np.float32).reshape(-1)
    if rate != 8000 or len(audio) < rate * .6 or not np.isfinite(audio).all():
        return None
    audio = audio[:rate * 40]
    if np.mean(np.abs(audio) >= .99) > .01:
        return None
    size, hop = 320, 160
    frames = np.lib.stride_tricks.sliding_window_view(audio, size)[::hop].copy()
    frames -= frames.mean(axis=1, keepdims=True)
    rms = np.sqrt(np.mean(frames**2, axis=1))
    active = rms > max(.003, float(np.percentile(rms, 85)) * .18)
    if active.sum() < 15 or active.mean() < .2:
        return None
    frames *= np.hanning(size).astype(np.float32)
    spectrum = np.fft.rfft(frames, n=1024)
    corr = np.fft.irfft(np.abs(spectrum)**2, n=1024)[:, :size]
    corr /= np.maximum(corr[:, :1], 1e-12)
    # Short-lag rolloff compensation; ignore unvoiced/noisy frames.
    lo, hi = int(rate / 450), int(rate / 70)
    search = corr[:, lo:hi]
    lag = np.argmax(search, axis=1) + lo
    voiced = active & (search.max(axis=1) > .55)
    if voiced.sum() < 12 or voiced.sum() / max(1, active.sum()) < .25:
        return None
    pitch = rate / lag[voiced]
    spread = float(np.log2(np.percentile(pitch, 85) / np.percentile(pitch, 15)))
    # Near-perfect steady tones are often music/test signals, not clear speech.
    if spread < .015 and float(np.median(search.max(axis=1)[voiced])) > .85:
        return None
    transitions = np.diff(np.r_[True, active, True].astype(np.int8))
    starts, ends = np.where(transitions == -1)[0], np.where(transitions == 1)[0]
    pauses = sum((b-a)*hop/rate >= .18 for a,b in zip(starts, ends))
    # Confidence is a voiced-frame heuristic, not an emotion probability.
    return {'level': float(20*np.log10(max(1e-8, np.median(rms[active])))),
            'variation': spread, 'pauses': float(pauses/(len(audio)/rate)),
            'confidence': float(min(1, voiced.sum()/max(1,active.sum())))}


def delivery_rows(rows, strength='balanced'):
    from dub_delivery import same_scene, phrase_role
    if strength not in ('gentle','balanced','strong'):
        raise ValueError('Invalid delivery strength')
    def reliable(f):
        try:
            return (isinstance(f, dict) and all(np.isfinite(f[k]) for k in ('level','variation','pauses','confidence'))
                    and .35 <= f['confidence'] <= 1 and f['variation'] >= 0 and f['pauses'] >= 0)
        except (KeyError, TypeError, ValueError):
            return False
    valid = [r['features'] for r in rows if reliable(r.get('features'))]
    if len(valid) < 3:
        return [{**r, 'delivery': None} for r in rows]
    baseline = float(np.median([f['level'] for f in valid]))
    # A sustained level change after a scene cut must not turn every sentence
    # into a new expressive style. Use local evidence when sufficient, otherwise
    # retain the conservative overall baseline. Unknown audio breaks continuity.
    scenes, scene = [], []
    for index, row in enumerate(rows):
        if scene and (not same_scene(rows[index-1], row)
                      or not reliable(rows[index-1].get('features'))
                      or not reliable(row.get('features'))):
            scenes.append(scene); scene = []
        scene.append(index)
    if scene: scenes.append(scene)
    baselines = {}
    for scene in scenes:
        levels = [rows[i]['features']['level'] for i in scene if reliable(rows[i].get('features'))]
        scene_baseline = float(np.median(levels)) if len(levels) >= 3 else baseline
        baselines.update((i, scene_baseline) for i in scene)
    # Strength changes thresholds, never pitch-shifts the chosen speaker.
    level_delta = {'gentle':6.,'balanced':4.,'strong':3.}[strength]
    result=[]
    for index, row in enumerate(rows):
        f=row.get('features')
        if not reliable(f):
            result.append({**row,'delivery':None}); continue
        local_baseline = baselines[index]
        energy='high' if f['level'] > local_baseline+level_delta else 'low' if f['level'] < local_baseline-level_delta else 'normal'
        variation='varied' if f['variation'] > .55 else 'steady' if f['variation'] < .12 else 'normal'
        result.append({**row,'delivery':{'energy':energy,'variation':variation,
                                       'pauses':'frequent' if f['pauses'] > .65 else 'normal'}})
    # Smooth only isolated energy spikes; never across gaps or unknown speech.
    original = list(result)
    for i in range(1,len(result)-1):
        a,b,c=original[i-1:i+2]
        if (all(r['delivery'] for r in (a,b,c))
                and same_scene(a,b) and same_scene(b,c)
                and phrase_role(b.get('text','')) not in ('question','emphatic','mixed')
                and a['delivery']['energy']==c['delivery']['energy']):
            result[i]={**b,'delivery':{**b['delivery'],'energy':a['delivery']['energy']}}
    return result


def delivery_instruction(delivery):
    if not delivery:
        return ''
    choices={'energy':{'low':'with restrained energy','normal':'with moderate energy','high':'with more expressive energy, without shouting'},
             'variation':{'steady':'with a steady intonation','normal':'with natural intonation','varied':'with varied intonation'},
             'pauses':{'normal':'with natural pauses','frequent':'with deliberate pauses'}}
    if not isinstance(delivery,dict) or set(delivery)!=set(choices):
        raise ValueError('Invalid acoustic delivery')
    try:
        return '(Speaking '+', '.join(choices[k][delivery[k]] for k in choices)+') '
    except (KeyError,TypeError):
        raise ValueError('Invalid acoustic delivery') from None
