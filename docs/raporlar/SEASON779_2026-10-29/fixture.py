from pathlib import Path
import soundfile as sf,numpy as np,subprocess
root=Path('tmp/r779');voice,rate=sf.read('tmp/r752/turkish-reference.wav');out=np.zeros(35*rate)
for start in [1,12,23]:out[start*rate:start*rate+len(voice)]=voice
sf.write(root/'voice.wav',out,rate)
for index,shift in [(1,1),(2,2)]:
 name=f'Bolum {index:02d}';target=root/'season'/(name+'.mp4')
 subprocess.run(['C:/ffmpeg/bin/ffmpeg.exe','-v','error','-nostdin','-y','-f','lavfi','-i','color=c=black:s=160x90:r=10:d=35','-i',str(root/'voice.wav'),'-c:v','libx264','-preset','ultrafast','-c:a','aac','-shortest',str(target)],check=True,capture_output=True)
 cues=[]
 for i,start in enumerate([1,12,23],1):
  a=start+shift;b=a+8
  cues.append(f'{i}\n00:00:{a:02d},000 --> 00:00:{b:02d},000\nSentetik konuşma {i}.\n')
 (root/'season'/(name+'.srt')).write_text('\n'.join(cues),encoding='utf-8-sig')
print('two synthetic videos and SRT fixtures ready')
