from pathlib import Path
import json, subprocess,sys
import numpy as np,soundfile as sf
sys.path.insert(0,'tools/voxcpm2')
from measure_background import measure
results=[]
for label in ['voice-heavy','music-heavy']:
 folder=Path('tmp/r768')/label
 cmd=[sys.executable,'tools/voxcpm2/measure_background.py','--speech',str(folder/'speech.wav'),'--music',str(folder/'music.wav'),'--separated',str(folder/'separated.wav'),'--start','2','--end','8']
 p=subprocess.run(cmd,capture_output=True,text=True);assert p.returncode==0,p.stderr
 result=json.loads(p.stdout)
 v,sr=sf.read(folder/'speech.wav',always_2d=True);m,_=sf.read(folder/'music.wav',always_2d=True)
 a,b=2*sr,8*sr
 baseline=measure(v[a:b],m[a:b],v[a:b]+m[a:b])
 dec=subprocess.run(['C:/ffmpeg/bin/ffmpeg.exe','-v','error','-i',str(folder/'separated.wav'),'-f','null','-'],capture_output=True);assert dec.returncode==0,dec.stderr
 results.append({'case':label,'measurement':result,'baseline':baseline,'ffmpeg_decode_exit':dec.returncode})
Path('tmp/r768/measurement.json').write_text(json.dumps(results,indent=2),encoding='utf-8')
print(json.dumps(results))
