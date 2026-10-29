from pathlib import Path
import sys, os, subprocess
import soundfile as sf, numpy as np
root=Path('tmp/r782'); root.mkdir(parents=True,exist_ok=True)
voice,rate=sf.read(sys.argv[1],dtype='float32')
if voice.ndim!=1 or not 3<=len(voice)/rate<=9:
    raise ValueError('Use a disposable synthetic mono speech WAV, 3-9 seconds.')
block=np.zeros(rate*12,dtype='float32');block[rate:rate+len(voice)]=voice
with sf.SoundFile(root/'long-synthetic.wav','w',samplerate=rate,channels=1,subtype='PCM_16') as f:
    for _ in range(150):f.write(block)
short=np.zeros(rate*35,dtype='float32')
for start in [1,12,23]:short[start*rate:start*rate+len(voice)]=voice
sf.write(root/'short-synthetic.wav',short,rate,subtype='PCM_16')
subprocess.run([os.environ.get('WHISPER_TEST_FFMPEG','C:/ffmpeg/bin/ffmpeg.exe'),'-v','error','-nostdin','-y','-f','lavfi','-i','color=c=black:s=160x90:r=10:d=35','-i',str(root/'short-synthetic.wav'),'-c:v','libx264','-preset','ultrafast','-c:a','aac','-shortest',str(root/'short-synthetic.mp4')],check=True,capture_output=True)
print('Disposable 1800s WAV and35s MP4 prepared')
