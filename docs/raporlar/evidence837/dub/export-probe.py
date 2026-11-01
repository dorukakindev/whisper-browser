import sys, json, importlib.util, os
from pathlib import Path
root=Path(sys.argv[1]); out=Path(sys.argv[2]); os.chdir(out)
spec=importlib.util.spec_from_file_location('dub_export',root/'backend/dub_export.py'); d=importlib.util.module_from_spec(spec);spec.loader.exec_module(d)
d.probe=lambda ffmpeg,file: {'format':{'duration':'12'},'streams':[{'codec_type':'video'},{'codec_type':'audio'}]}
commands=[];d.run=lambda command: commands.append(command)
request={'voice':'fixture-voice.wav','video':'fixture-video.mkv','kind':'dual','sync':None,'mix':{'voice':1,'background':.75,'music':.75,'ambience':.75,'duck':True,'duckAmount':.35},'rows':[],'background':'fixture-background.wav','music':'fixture-music.wav','ambience':'fixture-ambience.wav'}
d.export(request,'fixture-output.mp4','ffmpeg')
print(json.dumps({'command':commands[0],'graph':Path('filters.txt').read_text(),'map_time_control':d.map_time({'segments':[{'v0':1,'v1':3,'a0':1,'a1':5}]},4)}))