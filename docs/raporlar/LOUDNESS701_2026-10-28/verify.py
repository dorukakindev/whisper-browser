from pathlib import Path
import json,sys,subprocess,math,hashlib
import numpy as np
import soundfile as sf
project=Path(sys.argv[1]).resolve();source=Path(sys.argv[2]).resolve();dest=Path(sys.argv[3]).resolve();dest.mkdir(parents=True,exist_ok=True)
sys.path.insert(0,str(project/'tools/voxcpm2'));sys.path.insert(0,str(project/'backend'))
from dub_normalize import loudnorm_audio
import transcribe
ffmpeg=transcribe.find_ffmpeg();assert ffmpeg

def run(cmd,**opts):return subprocess.run([ffmpeg,*cmd[1:]],**opts)
def measure(path):
 p=run(['ffmpeg','-hide_banner','-nostats','-i',str(path),'-af','loudnorm=I=-20:TP=-2:LRA=11:print_format=json','-f','null','-'],capture_output=True,text=True,encoding='utf-8',errors='replace',timeout=30)
 assert p.returncode==0
 return json.JSONDecoder().raw_decode(p.stderr[p.stderr.rfind('{'):])[0]
y,sr=sf.read(source,dtype='float32');assert y.ndim==1
rows=[]
for name,gain,stereo in [('quiet',.1,False),('loud',2.,False),('stereo',1.,True)]:
 audio=y*gain
 if stereo:audio=np.repeat(audio[:,None],2,axis=1)
 path=dest/(name+'.wav');sf.write(path,audio,sr,subtype='FLOAT')
 before=measure(path);info=sf.info(path)
 assert loudnorm_audio(path,runner=run)==path
 after=measure(path);out=sf.info(path);samples,rate=sf.read(path,dtype='float32')
 assert abs(float(after['input_i'])+20)<=.5,(name,after)
 assert float(after['input_tp'])<=-1.9,(name,after)
 assert abs(info.duration-out.duration)<=1/rate
 assert out.channels==info.channels and np.isfinite(samples).all()
 assert np.max(np.abs(samples))<1
 rows.append(dict(case=name,before=before,after=after,duration=out.duration,channels=out.channels,peak=float(np.max(np.abs(samples)))))
quality=json.loads(source.with_suffix('.quality.json').read_text(encoding='utf-8'))
transitions=[]
for prev,current in zip(quality['groups'],quality['groups'][1:]):
 stop=float(prev['audioEnd']);start=float(current['audioStart']);idx=round(start*sr)
 transitions.append(dict(fromGroup=prev['group'],toGroup=current['group'],gapSeconds=start-stop,onsetSampleJump=float(abs(y[idx]-y[idx-1])) if 0<idx<len(y) else None))
report=dict(sourceSha256=hashlib.sha256(source.read_bytes()).hexdigest(),baseline=measure(source),cases=rows,transitions=transitions,scope='Real generated synthetic-reference speech. Objective loudness and boundary measurements; no human naturalness preference.')
(dest/'acceptance.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(report,ensure_ascii=False))
