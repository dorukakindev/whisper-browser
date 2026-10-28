from pathlib import Path
import sys,json,time,os
os.environ['HF_HUB_OFFLINE']='1'
from faster_whisper import WhisperModel
root=Path(sys.argv[2]).resolve()
project=Path(sys.argv[1]).resolve()
sys.path.insert(0,str(project/'tools/voxcpm2'))
from dub_quality import speech_check
from dub_plan import parse_srt
start=time.monotonic()
model=WhisperModel('small',device='cpu',compute_type='int8',local_files_only=True)
segments,info=model.transcribe(str(root/'result.wav'),language='tr',beam_size=3,vad_filter=False)
text=' '.join(s.text.strip() for s in segments)
expected=' '.join(t for _,_,t in parse_srt(root/'translated'/'Türkçe kaynak.tr.speech.srt'))
check=speech_check(expected,text)
(root/'verification.json').write_text(json.dumps({'expected':expected,'actual':text,'check':check,'seconds':round(time.monotonic()-start,3),'model':'small','device':'cpu'},ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'actual':text,'check':check},ensure_ascii=False))
