"""Create a local A/B listening report. Measurements are not a naturalness score."""
import argparse
import html
import json
from pathlib import Path
import numpy as np
import soundfile as sf

def describe(file):
    # Python opens Unicode Windows paths reliably; pass libsndfile a file object.
    with file.open('rb') as stream:
        audio,rate=sf.read(stream,dtype='float32',always_2d=True)
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

def write_report(audio, output):
    rows=[describe(p) for p in audio];output.mkdir(parents=True,exist_ok=True)
    (output/'comparison.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2),encoding='utf-8')
    cards=[]
    for i,(p,row) in enumerate(zip(audio,rows)):
        label=chr(65+i) if i<26 else str(i+1)
        data=html.escape(json.dumps(row,ensure_ascii=False,indent=2))
        flagged=sum(group['status']!='ready' for group in row['groups'])
        evidence=(f"{len(row['groups'])} grup · {flagged} inceleme" if row['groups'] else 'Grup doğrulaması yok')
        cards.append(f'<article><header><span class="sample">{label}</span><div><h2>Örnek {label}</h2><p>{html.escape(evidence)}</p></div></header><audio controls preload="metadata" src="{html.escape(p.resolve().as_uri(),quote=True)}"></audio><div class="stats"><span><small>Ses uzunluğu</small>{row["seconds"]} sn</span><span><small>Ölçülen sessizlik</small>%{round(row["silenceFraction"]*100)}</span></div><details><summary>Teknik ölçümler ve ASR kanıtı</summary><pre>{data}</pre></details></article>')
    style="""*{box-sizing:border-box}html{color-scheme:dark}body{background:#0e1115;color:#f0efed;font:16px/1.65 'Segoe UI',sans-serif;margin:0;padding:40px 24px}main{max-width:1120px;margin:auto}h1{font-size:clamp(26px,4vw,40px);line-height:1.2;letter-spacing:-.025em;margin:12px 0 18px}h2{font-size:20px;margin:0}p{color:#b6bbc3;margin:6px 0}.eyebrow{color:#d5a35c;font-size:13px;letter-spacing:.06em}.intro{max-width:78ch;margin-bottom:28px}.samples{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px}article{min-width:0;border:1px solid #343b45;background:#171c22;border-radius:18px;padding:24px}article header{display:flex;gap:14px;align-items:center;margin-bottom:24px}.sample{display:grid;place-items:center;width:44px;height:44px;background:#29251e;color:#d5a35c;border-radius:10px;font-weight:600}audio{width:100%;height:42px}.stats{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:22px 0;font-variant-numeric:tabular-nums}.stats span{background:#11161c;padding:12px;border-radius:9px}.stats small{display:block;color:#b6bbc3;font-size:12px}details{border-top:1px solid #343b45;padding-top:16px}summary{cursor:pointer;color:#d5a35c;padding:6px 0}pre{font:12px/1.6 monospace;white-space:pre-wrap;overflow-wrap:anywhere;color:#b6bbc3}footer{margin-top:26px;padding-top:20px;border-top:1px solid #343b45;color:#b6bbc3;font-size:13px}:focus-visible{outline:2px solid #d5a35c;outline-offset:4px}@media(max-width:720px){body{padding:24px 16px}.samples{grid-template-columns:1fr}article{padding:20px}}"""
    (output/'listen.html').write_text('<!doctype html><html lang="tr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Dublaj dinleme karşılaştırması</title><style>'+style+'</style><main><div class="eyebrow">VoxCPM2 · Dinleme odası</div><h1>Aynı metin, iki okuma biçimi.</h1><p class="intro">Örnekleri aynı ses düzeyinde dinle. Cümle başlangıcını, anlamın tamamını, durakları ve ton devamlılığını karşılaştır. Önce kendi tercihini belirle; teknik ölçümleri daha sonra açabilirsin.</p><div class="samples">'+''.join(cards)+'</div><footer>ASR ve sessizlik ölçümleri insan doğallığını ya da ses benzerliğini kanıtlamaz. Örneklerin gruplama biçimi ve motorun sıcak/soğuk durumu üretim süresini etkiler. Otomatik kazanan seçilmez; uygulama ayarların değiştirilmez.</footer></main></html>',encoding='utf-8')
    return rows

def main():
    parser=argparse.ArgumentParser();parser.add_argument('audio',type=Path,nargs='+');parser.add_argument('--output',type=Path,required=True);args=parser.parse_args()
    rows=write_report(args.audio,args.output)
    print(json.dumps({'output':str(args.output),'samples':len(rows)}))
if __name__=='__main__':main()
