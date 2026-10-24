"""Create a local A/B listening report. Measurements are not a naturalness score."""
import argparse
import html
import json
from pathlib import Path
import numpy as np
import soundfile as sf

def describe(file):
    audio,rate=sf.read(file,dtype='float32',always_2d=True)
    mono=audio.mean(axis=1)
    hop=max(1,int(rate*.02));frames=len(mono)//hop
    energy=np.sqrt(np.mean(mono[:frames*hop].reshape(frames,hop)**2,axis=1)) if frames else np.zeros(0)
    threshold=max(.001,float(np.percentile(energy,80))*.1 if frames else .001)
    silent=energy<threshold
    starts=np.where(silent & np.r_[True,~silent[:-1]])[0] if frames else []
    ends=np.where(silent & np.r_[~silent[1:],True])[0]+1 if frames else []
    pauses=[round((b-a)*.02,3) for a,b in zip(starts,ends) if b-a>=10]
    def sidecar(suffix):
        p=file.with_suffix(suffix)
        try:return json.loads(p.read_text(encoding='utf-8'))
        except (OSError,ValueError):return None
    quality=sidecar('.quality.json');performance=sidecar('.performance.json')
    return {'name':file.name,'seconds':round(len(mono)/rate,3),'rms':round(float(np.sqrt(np.mean(mono**2))),5),
        'peak':round(float(np.max(np.abs(mono),initial=0)),5),'silenceFraction':round(float(np.mean(silent)),3) if frames else 0,
        'pausesOver200ms':pauses,'performance':performance,
        'groups':[{'key':r.get('key'),'status':r.get('status'),'verification':r.get('verification')} for r in (quality or {}).get('groups',[])]}

def main():
    parser=argparse.ArgumentParser();parser.add_argument('audio',type=Path,nargs='+');parser.add_argument('--output',type=Path,required=True);args=parser.parse_args()
    rows=[describe(p) for p in args.audio];args.output.mkdir(parents=True,exist_ok=True)
    (args.output/'comparison.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2),encoding='utf-8')
    cards=[]
    for p,row in zip(args.audio,rows):
        label=html.escape(row['name']);data=html.escape(json.dumps(row,ensure_ascii=False,indent=2))
        cards.append(f'<article><h2>{label}</h2><audio controls preload="metadata" src="{html.escape(p.resolve().as_uri(),quote=True)}"></audio><p>Süre: {row["seconds"]} sn · Sessiz bölüm oranı: {row["silenceFraction"]}</p><details><summary>Ölçümler ve konuşma kontrolü</summary><pre>{data}</pre></details></article>')
    (args.output/'listen.html').write_text('<!doctype html><html lang="tr"><meta charset="utf-8"><title>Dublaj A/B karşılaştırması</title><style>body{background:#111113;color:#eee;font:16px/1.7 system-ui;max-width:1000px;margin:40px auto;padding:20px}article{border:1px solid #444;padding:24px;margin:20px 0;border-radius:12px}h1,h2{line-height:1.3}audio{width:100%}pre{white-space:pre-wrap;overflow-wrap:anywhere}summary{cursor:pointer}</style><h1>Aynı metni birlikte karşılaştır</h1><p>Ses tonu devamlılığını, cümle geçişlerini, durakları ve eksik okumayı dinle. Buradaki enerji, sessizlik ve ASR ölçümleri insan doğallığını veya ses benzerliğini kanıtlamaz. Kayıtlı veya kurtarılan parçaları içeren koşuları soğuk üretimle doğrudan hız karşılaştırması sayma.</p>'+''.join(cards)+'</html>',encoding='utf-8')
    print(json.dumps({'output':str(args.output),'samples':len(rows)}))
if __name__=='__main__':main()
