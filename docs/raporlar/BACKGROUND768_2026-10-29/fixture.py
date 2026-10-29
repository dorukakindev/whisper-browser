from pathlib import Path
import json,numpy as np,soundfile as sf
root=Path('tmp/r768');sr=44100;t=np.arange(sr*12)/sr
ref,rate=sf.read('tmp/r752/turkish-reference.wav',dtype='float32');assert rate==22050
voice=np.interp(np.arange(len(ref)*2)/2,np.arange(len(ref)),ref);speech=np.zeros(len(t),dtype='float32');speech[round(.8*sr):round(.8*sr)+len(voice)]=voice
# Deterministic self-composed chord/arpeggio and light percussive texture.
left=np.zeros_like(t);right=np.zeros_like(t);rng=np.random.default_rng(768)
for i,f in enumerate([130.8128,164.8138,195.9977]):
 envelope=.5+.5*np.sin(2*np.pi*(.5+i*.125)*t+i)**2
 left+=envelope*(np.sin(2*np.pi*f*t)+.3*np.sin(2*np.pi*2*f*t))
 right+=envelope*(np.sin(2*np.pi*f*t+.15)+.3*np.sin(2*np.pi*2*f*t+.3))
pulse=np.exp(-18*(t%.5));texture=rng.standard_normal(len(t))*.07*pulse
music=np.column_stack((left+texture,right-texture)).astype('float32')*.055
speech=np.column_stack((speech,speech))
for label,sg,mg in [('voice-heavy',1.,.4),('music-heavy',.4,1.)]:
 folder=root/label;folder.mkdir(exist_ok=True);v=speech*sg;m=music*mg;mix=v+m;assert np.max(np.abs(mix))<.98
 for name,y in [('speech',v),('music',m),('mixture',mix)]:sf.write(folder/(name+'.wav'),y,sr,subtype='FLOAT')
(folder.parent/'source.srt').write_text('1\n00:00:00,800 --> 00:00:09,634\nSynthetic speech and chord background.\n',encoding='utf-8-sig')
print(json.dumps({'source_seconds':12,'selected_seconds':[2,8],'cases':2,'sample_rate':sr}))
