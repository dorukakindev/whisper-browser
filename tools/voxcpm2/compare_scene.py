"""Opt-in production grouping comparison for one local scene, with no automatic winner."""
import argparse
import contextlib
import hashlib
import importlib.util
import json
import multiprocessing
import os
from pathlib import Path
import time


def main(argv=None):
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--run',action='store_true')
    for name in ('srt','reference','transcript','engine','verify-python','output'):
        parser.add_argument('--'+name,type=Path,required=True)
    parser.add_argument('--flow-mode',choices=['akici','anlatim'],default='akici')
    args=parser.parse_args(argv)
    from accept_dub import inspect_gpu
    readiness=inspect_gpu()
    if not args.run or not readiness['ready']:
        print(json.dumps({'status':'ready_not_run' if readiness['ready'] else 'blocked_gpu',**readiness}))
        return 0 if readiness['ready'] else 2
    for file in (args.srt,args.reference,args.transcript,args.verify_python):
        if not file.is_file():parser.error('An input file is missing')
    if not (args.engine/'kitap_ortak.py').is_file():parser.error('Engine directory is invalid')
    from dub_plan import parse_srt
    cues=parse_srt(args.srt)
    if not cues or len(cues)>80 or max(e for _,e,_ in cues)>180000:
        parser.error('Choose a scene of at most three minutes and 80 cues starting near zero')
    args.output=args.output.resolve();args.output.mkdir(parents=True,exist_ok=False)
    os.environ.update(VOXCPM_ROOT=str(args.engine.resolve()),HF_HUB_OFFLINE='1',TRANSFORMERS_OFFLINE='1')
    import altyazi_oku as reader
    from dub_runtime import EngineSession
    from accept_dub import verify_final
    session=EngineSession()
    result={'version':1,'sourceSha256':hashlib.sha256(args.srt.read_bytes()).hexdigest(),
        'sameText':True,'settings':{'steps':15,'cfg':1.65,'temperature':.8,'timing':'video','maxSpeed':1},
        'naturalnessWinner':None,'limits':'Different grouping changes request count, group seeds and verification workload. Cold/warm times are reported, not ranked. ASR is not a naturalness score.','samples':[]}
    try:
        for label,grouping in [('A','satir'),('B',args.flow_mode)]:
            reader.OUTPUT_ROOT=args.output/('cache-'+label)
            output=args.output/('sample-'+label+'.wav')
            options=[str(args.srt.resolve()),str(args.reference.resolve()),'--transcript',str(args.transcript.resolve()),'--mode','hifi',
                '--output',str(output),'--steps','15','--cfg','1.65','--temperature','.8','--seed','42','--eszamanli','2',
                '--retry','1','--gruplama',grouping,'--grup-max-karakter','280','--grup-max-sn','18','--timing-mode','video',
                '--max-hiz','1','--verification','detailed','--verify-python',str(args.verify_python.resolve())]
            began=time.monotonic()
            with (args.output/(label+'.private.log')).open('w',encoding='utf-8') as log,contextlib.redirect_stdout(log),contextlib.redirect_stderr(log):
                code=reader.main(options,runtime=session)
            quality=json.loads(output.with_suffix('.quality.json').read_text(encoding='utf-8'))
            row={'sample':label,'grouping':grouping,'exit':code or 0,'productionSeconds':round(time.monotonic()-began,3),
                'phases':json.loads(output.with_suffix('.performance.json').read_text(encoding='utf-8')),
                'groups':quality['groups'],'wavSha256':hashlib.sha256(output.read_bytes()).hexdigest()}
            result['samples'].append(row)
            (args.output/'comparison.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
            print(json.dumps({'sample':label,'groups':len(row['groups']),'seconds':row['productionSeconds']}),flush=True)
    finally:session.close()
    # Release GPU before final independent CPU ASR and decoding checks.
    expected=' '.join(text for _,_,text in cues)
    for row in result['samples']:
        row['final']=verify_final(args.output/('sample-'+row['sample']+'.wav'),args.verify_python,expected)
        row['integrityPassed']=row['exit']==0 and row['final']['passed'] and all(g['status']=='ready' for g in row['groups'])
    tool=Path(__file__).resolve().parents[1]/'compare-dub-audio.py'
    spec=importlib.util.spec_from_file_location('compare_dub_audio',tool);report=importlib.util.module_from_spec(spec);spec.loader.exec_module(report)
    report.write_report([args.output/'sample-A.wav',args.output/'sample-B.wav'],args.output/'listen')
    (args.output/'comparison.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({'output':str(args.output),'integrityPassed':[row['integrityPassed'] for row in result['samples']],'naturalnessWinner':None}))
    return 0 if all(row['integrityPassed'] for row in result['samples']) else 3

if __name__=='__main__':
    multiprocessing.freeze_support()
    raise SystemExit(main())
