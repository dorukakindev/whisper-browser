"""Opt-in local A/B through the unchanged production dubbing pipeline.

Uses cached models and synthetic/public local inputs only when explicitly run.
The comparison includes each production mode's conditioning and finishing;
it does not isolate one acoustic variable or select a naturalness winner.
"""
import argparse
import hashlib
import json
import multiprocessing
import os
from pathlib import Path
import shutil
import subprocess
import sys
import time


def bounded_groups(srt, source_duration):
    from dub_plan import read_source_bytes, parse_srt, make_groups
    data = read_source_bytes(srt)
    groups = make_groups(parse_srt(srt, data), mode='satir')
    if not 3 <= len(groups) <= 8 or not 0 < source_duration <= 120:
        raise ValueError('Use 3–8 groups and a local source of at most 120 seconds.')
    if any(not g['text'].strip() or len(g['text']) > 300 or g['start'] < 0
           or g['end'] > source_duration * 1000 + 1 for g in groups):
        raise ValueError('Use complete short passages inside the source timeline.')
    return data, groups


def write_listening_page(output):
    cards = ''.join('<section><h2>Örnek '+label+'</h2><audio controls preload="metadata" src="sample-'+label.lower()+'.wav"></audio></section>' for label in ('A','B'))
    (output/'listen.html').write_text('''<!doctype html><html lang="tr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Anlatım karşılaştırması</title>
<style>:root{color-scheme:dark;--bg:#101216;--panel:#191c21;--line:#343942;--text:#eeeae4;--muted:#adb1b9;--accent:#d5a35c}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:16px/1.65 system-ui,sans-serif}main{max-width:1040px;margin:auto;padding:56px 28px}header{border-bottom:1px solid var(--line);padding-bottom:24px}small,summary{color:var(--accent)}h1{font-size:clamp(28px,4vw,42px);line-height:1.2;letter-spacing:-.7px;margin:12px 0}p{max-width:72ch;color:var(--muted)}.samples{display:grid;grid-template-columns:1fr 1fr;gap:22px;margin:28px 0}section{background:var(--panel);border:1px solid var(--line);border-radius:18px;padding:24px}h2{font-size:20px;margin:0 0 18px}audio{width:100%;height:48px;display:block}summary{min-height:44px;cursor:pointer;padding-top:12px}summary:focus-visible{outline:2px solid var(--accent);outline-offset:5px}details{border-top:1px solid var(--line)}footer{font-size:14px;color:var(--muted);margin-top:24px}@media(max-width:650px){main{padding:28px 18px}.samples{grid-template-columns:1fr}}</style>
<main><header><small>VoxCPM2 · Anlatım denemesi</small><h1>Aynı metin. İki anlatım yolu.</h1><p>Önce özgün kaydı dinle. Ardından kelimelerin tamlığını, durakları, vurguyu ve cümle geçişlerini A/B arasında karşılaştır. Ses düzeylerini rahat bir seviyeye ayarla.</p></header><section style="margin-top:28px"><h2>Özgün kaynak</h2><audio controls preload="metadata" src="source.wav"></audio></section><div class="samples">'''+cards+'''</div><details><summary>Dinledikten sonra ayarları göster</summary><p>A: Referans tonunu koru. B: Kaynaktaki anlatımı takip et · dengeli. B yolu enerji, perde değişkenliği ve duraklardan sınırlı yönlendirme çıkarır; kesin duygu etiketi veya birebir duygu aktarımı değildir. Kaynak belirsizse ek yönlendirme kullanılmaz.</p></details><footer>İki örnek üretim hattının kendi koşullandırma ve son işlem yollarını kullanır. Bu tek değişkenli bir model deneyi değildir. Otomatik kalite kazananı seçilmedi ve uygulama varsayılanları değiştirilmedi. Ölçümler comparison.json içindedir.</footer></main></html>''', encoding='utf-8')


def compare(args):
    import soundfile as sf
    source_info = sf.info(args.source)
    data, groups = bounded_groups(args.srt, source_info.duration)
    for file in (args.reference,args.transcript,args.source,args.verify_python,args.ffmpeg):
        if not file.is_file():
            raise ValueError('Missing comparison input: '+file.name)
    if not args.transcript.read_text(encoding='utf-8-sig').strip():
        raise ValueError('An exact reference transcript is required.')
    args.output.mkdir(parents=True, exist_ok=False)
    inputs=args.output/'inputs';inputs.mkdir()
    copies={}
    for key,file in [('srt',args.srt),('reference',args.reference),('transcript',args.transcript),('source',args.source)]:
        target=inputs/(key+file.suffix.lower());shutil.copyfile(file,target);copies[key]=target
    hashes={key:hashlib.sha256(file.read_bytes()).hexdigest() for key,file in copies.items()}
    # A bounded local PCM copy allows the same source to play in the audition.
    no_window=getattr(subprocess,'CREATE_NO_WINDOW',0)
    subprocess.run([str(args.ffmpeg),'-nostdin','-hide_banner','-loglevel','error','-i',str(copies['source']),'-vn','-ac','1',str(args.output/'source.wav')],check=True,timeout=120,creationflags=no_window)
    plan=args.output/'delivery.json'
    subprocess.run([sys.executable,str(Path(__file__).with_name('prepare_prosody.py')),'--source',str(copies['source']),'--srt',str(copies['srt']),'--output',str(plan),'--ffmpeg',str(args.ffmpeg),'--grouping','satir','--strength','balanced'],check=True,timeout=240,creationflags=no_window)
    mapping=json.loads(plan.read_text(encoding='utf-8'))
    guided=sum(bool(row.get('delivery')) for row in mapping['groups'])
    if not guided:
        raise ValueError('No sufficiently clear source speech for a delivery comparison. No GPU generation started.')
    os.environ['HF_HUB_OFFLINE']='1';os.environ['PYTHONUTF8']='1'
    import altyazi_oku as runtime
    runtime.OUTPUT_ROOT=args.output/'cache'
    result={'version':1,'input_hashes':hashes,'model_revision':runtime.MODEL_REVISION,'guided_groups':guided,
            'total_groups':len(groups),'steps':15,'seed':42,'concurrency':1,'human_preference':None,
            'naturalness_winner':None,'limits':'Production-mode comparison, not isolated tag causality or human quality proof.','samples':[]}
    for label,automatic in [('A',False),('B',True)]:
        free=subprocess.run(['nvidia-smi','--query-gpu=memory.free','--format=csv,noheader,nounits'],capture_output=True,text=True,check=True,timeout=15,creationflags=no_window)
        if int(free.stdout.strip().splitlines()[0])<9500:
            raise ValueError('Less than 9500 MiB GPU memory free; close no applications automatically.')
        target=args.output/('sample-'+label.lower()+'.wav')
        argv=[str(copies['srt']),str(copies['reference']),'--transcript',str(copies['transcript']),'--mode','hifi','--steps','15','--seed','42','--eszamanli','1','--gruplama','satir','--timing-mode','video','--verification','detailed','--verify-python',str(args.verify_python),'--retry','1','--output',str(target)]
        if automatic:argv+=['--prosody-plan',str(plan)]
        start=time.monotonic();code=runtime.main(argv)
        if code!=0:raise ValueError('Production mode failed: '+label)
        quality=json.loads(target.with_suffix('.quality.json').read_text(encoding='utf-8'))
        performance=json.loads(target.with_suffix('.performance.json').read_text(encoding='utf-8'))
        info=sf.info(target)
        result['samples'].append({'label':label,'follow_delivery':automatic,'seconds':round(time.monotonic()-start,3),
                                  'audio_seconds':info.duration,'sample_rate':info.samplerate,'quality':quality,'performance':performance,
                                  'sha256':hashlib.sha256(target.read_bytes()).hexdigest()})
        (args.output/'comparison.json').write_text(json.dumps(result,ensure_ascii=False,indent=2,allow_nan=False),encoding='utf-8')
    write_listening_page(args.output)
    return result


if __name__=='__main__':
    multiprocessing.freeze_support()
    parser=argparse.ArgumentParser(description=__doc__)
    for name in ('source','srt','reference','transcript','verify-python','ffmpeg','output'):
        parser.add_argument('--'+name,type=Path,required=True)
    compare(parser.parse_args())

