"""Opt-in real speech checks: pronunciations and densely timed source captions.

Uses existing local models only. Never changes application defaults or sources.
All audio, cache, reference-derived data and logs stay in the chosen new folder.
"""
import argparse
import contextlib
import hashlib
import json
import multiprocessing
import os
from pathlib import Path
import time


def dense_subtitles(source, target, factor):
    from dub_plan import parse_srt
    if not 1 <= factor <= 3:
        raise ValueError('Density factor must be between one and three')
    cues = parse_srt(source)
    if not cues:
        raise ValueError('No source captions')
    def stamp(ms):
        return f'{ms//3600000:02}:{ms//60000%60:02}:{ms//1000%60:02},{ms%1000:03}'
    text = '\n\n'.join(f'{ordinal}\n{stamp(round(start/factor))} --> {stamp(max(round(start/factor)+1,round(end/factor)))}\n{value}'
                       for ordinal,(start,end,value) in zip(cues.source_ids,cues))
    with target.open('x',encoding='utf-8-sig') as file:
        file.write(text+'\n')
    return max(end for _,end,_ in cues)/factor/1000


def main(argv=None):
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--run',action='store_true')
    for field in ('engine','reference','transcript','verify-python','srt','pronunciations','output'):
        parser.add_argument('--'+field,type=Path)
    parser.add_argument('--density',type=float,default=2)
    args=parser.parse_args(argv)
    from accept_dub import inspect_gpu
    readiness=inspect_gpu()
    if not args.run or not readiness['ready']:
        print(json.dumps({'status':'ready_not_run' if readiness['ready'] else 'blocked_gpu',**readiness}))
        return 0 if readiness['ready'] else 2
    for field in ('engine','reference','transcript','verify_python','srt','pronunciations','output'):
        if getattr(args,field) is None:
            parser.error('--run requires --'+field.replace('_','-'))
    for field in ('reference','transcript','verify_python','srt','pronunciations'):
        if not getattr(args,field).is_file():
            parser.error('Missing local input: '+field)
    if not (args.engine/'kitap_ortak.py').is_file() or not 1 <= args.density <= 3:
        parser.error('Invalid engine or density')
    from dub_pronunciation import load,render
    dictionary=load(args.pronunciations)
    from dub_plan import parse_srt
    cues=parse_srt(args.srt)
    if not cues or max(end for _,end,_ in cues)>180000:
        parser.error('Choose a subtitle scene of at most three minutes, starting near zero')
    if not any(render(text,dictionary)!=render(text,[]) for _,_,text in cues):
        parser.error('The dictionary must change at least one source phrase')
    args.output.mkdir(parents=True,exist_ok=False)
    dense=args.output/'dense.srt'
    duration=dense_subtitles(args.srt,dense,args.density)
    os.environ.update(VOXCPM_ROOT=str(args.engine.resolve()),HF_HUB_OFFLINE='1',TRANSFORMERS_OFFLINE='1')
    import altyazi_oku as reader
    from dub_runtime import EngineSession
    from accept_dub import verify_final
    runtime=EngineSession()
    results={'readiness':readiness,'source_sha256':hashlib.sha256(args.srt.read_bytes()).hexdigest(),'cases':[],'naturalness_winner':None}
    try:
        for name,source,mapping in [('pronunciation',args.srt,dictionary),('dense',dense,[])]:
            reader.OUTPUT_ROOT=args.output/name/'cache'
            wave=args.output/(name+'.wav')
            options=[str(source.resolve()),str(args.reference.resolve()),'--transcript',str(args.transcript.resolve()),'--mode','hifi','--output',str(wave.resolve()),'--steps','15','--cfg','1.65','--temperature','.8','--seed','42','--eszamanli','2','--retry','1','--gruplama','akici','--grup-max-karakter','280','--grup-max-sn','18','--timing-mode','video','--max-hiz','1','--verification','detailed','--verify-python',str(args.verify_python.resolve())]
            if mapping:
                options+=['--pronunciations',str(args.pronunciations.resolve())]
            else:
                options+=['--range-start','0','--range-end',str(duration)]
            began=time.monotonic()
            print('START '+name,flush=True)
            row={'name':name}
            try:
                with (args.output/(name+'.private.log')).open('w',encoding='utf-8') as log,contextlib.redirect_stdout(log),contextlib.redirect_stderr(log):
                    code=reader.main(options,runtime=runtime)
                row.update(exit=code or 0,quality=json.loads(wave.with_suffix('.quality.json').read_text(encoding='utf-8')),phases=json.loads(wave.with_suffix('.performance.json').read_text(encoding='utf-8')),
                           final=verify_final(wave,args.verify_python,' '.join(render(t,mapping) for _,_,t in reader.parse_srt(source))))
                row['integrity_evidence_passed']=row['exit']==0 and row['final']['passed'] and bool(row['quality'].get('groups')) and all(group['status']=='ready' for group in row['quality']['groups'])
                row['status']='produced_needs_listening'
            except Exception as error:
                row.update(error=type(error).__name__)
            row['wall_seconds']=round(time.monotonic()-began,3)
            results['cases'].append(row)
            (args.output/'results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
    finally:
        runtime.close()
    return 0 if all(row.get('integrity_evidence_passed') for row in results['cases']) else 3


if __name__=='__main__':
    multiprocessing.freeze_support()
    raise SystemExit(main())
