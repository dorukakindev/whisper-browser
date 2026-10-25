"""Measure a controlled separation against known, aligned speech/music stems.

Projection estimates describe this signal only; they are not a listening score.
No model, download, transcription, normalization or output audio is performed.
"""
import argparse
import json
import math
from pathlib import Path


def measure(speech, music, separated):
    import numpy as np
    arrays=[np.asarray(value,dtype=np.float64) for value in (speech,music,separated)]
    if any(value.size==0 or value.shape!=arrays[0].shape or not np.isfinite(value).all() for value in arrays):
        raise ValueError('Known stems and result must be finite, nonempty and aligned')
    design=np.column_stack([value.reshape(-1) for value in arrays[:2]])
    target=arrays[2].reshape(-1)
    coefficients,_,rank,_=np.linalg.lstsq(design,target,rcond=None)
    if rank<2 or np.mean(target**2)<1e-14:
        raise ValueError('Independent non-silent stems and output are required')
    residual=float(np.mean((target-design@coefficients)**2)/np.mean(target**2))
    return {'speech_projection_db':float(20*np.log10(max(abs(coefficients[0]),1e-9))),
            'music_projection_db':float(20*np.log10(max(abs(coefficients[1]),1e-9))),
            'residual_fraction':residual,'peak':float(np.max(np.abs(arrays[2]))),
            'clipped_fraction':float(np.mean(np.abs(arrays[2])>=.999)),
            'listening_required':True}


def main(argv=None):
    parser=argparse.ArgumentParser(description=__doc__)
    for name in ('speech','music','separated'):
        parser.add_argument('--'+name,type=Path,required=True)
    parser.add_argument('--start',type=float,default=0)
    parser.add_argument('--end',type=float,required=True)
    args=parser.parse_args(argv)
    if not all(math.isfinite(value) for value in (args.start,args.end)) or not 0<=args.start<args.end or args.end-args.start>180:
        parser.error('Choose an interval of at most three minutes')
    import soundfile as sf
    samples=[]
    rate=None
    for source in (args.speech,args.music,args.separated):
        with sf.SoundFile(source) as file:
            if rate is None:rate=file.samplerate
            if file.samplerate!=rate:raise ValueError('Sample rates must match')
            begin=0 if source==args.separated else round(args.start*rate)
            count=round((args.end-args.start)*rate)
            if abs(len(file)-count)>round(rate*.01) and source==args.separated:
                raise ValueError('Separated duration does not match the selected interval')
            file.seek(begin)
            samples.append(file.read(count,dtype='float32',always_2d=True))
    result=measure(*samples)
    result.update(start=args.start,end=args.end,seconds=len(samples[2])/rate,sample_rate=rate)
    print(json.dumps(result))


if __name__=='__main__':main()
