import ast,sys,json,wave
from pathlib import Path
from types import SimpleNamespace as NS,ModuleType
from unittest.mock import patch
ROOT=Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT/'backend'))
import transcribe as T
OUT=Path(__file__).parent
main=next(n for n in ast.parse((ROOT/'backend/transcribe.py').read_text(encoding='utf-8')).body if isinstance(n,ast.FunctionDef) and n.name=='main')
prefix=[]
for n in main.body:
 if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='args' for t in n.targets):break
 prefix.append(n)
env=dict(T.__dict__);exec(compile(ast.Module(body=prefix,type_ignores=[]),'parser','exec'),env)
a=env['parser'].parse_args(['--input',str(OUT/'resume.wav'),'--output-dir',str(OUT/'resume-out'),'--device','cpu','--compute-type','int8','--diarize','true','--formats','json','--fix-timings','false','--snap-to-speech','false','--split-mode','none','--fix-common-errors','false','--drop-repeated-hallucinations','false'])
a.scene_context=None
with wave.open(a.input,'wb') as f:f.setnchannels(1);f.setsampwidth(2);f.setframerate(16000);f.writeframes(b'\0\0'*16_000*12)
Path(a.output_dir).mkdir(exist_ok=True)
T.write_checkpoint(T._checkpoint_path(a.input,a.cache_dir),T.job_signature(a),[(0,2,'Old first sentence.'),(3,5,'Old second sentence.'),(8,10,'Old boundary sentence.')],10,detected_language='en')
extract=[]
def wav_stub(_src,dst,ff,**kw):
 extract.append(kw)
 with wave.open(dst,'wb') as f:f.setnchannels(1);f.setsampwidth(2);f.setframerate(16000);f.writeframes(b'\0\0'*16000*4)
class Model:
 def __init__(self,*_a,**_k):pass
 def transcribe(self,*_a,**_k):
  return iter([NS(start=0.,end=2.,text='New boundary sentence.',words=[]),NS(start=2.,end=4.,text='New final sentence.',words=[])]),NS(language='en',language_probability=1.,duration=4.)
fake=ModuleType('faster_whisper');fake.WhisperModel=Model
work=OUT/'resume-work';work.mkdir(exist_ok=True)
events=[]
with patch.dict(sys.modules,{'faster_whisper':fake}),patch.object(T,'find_ffmpeg',return_value='fixture'),patch.object(T,'extract_audio',side_effect=wav_stub),patch.object(T,'check_vram_budget'),patch.object(T,'job_temp_directory',return_value=str(work)),patch.object(T,'run_diarization',return_value=[(0.,4.,'SPEAKER_00')]),patch.object(T,'emit',side_effect=lambda typ,**v:events.append(dict(type=typ,**v))):
 T.transcribe(a)
done=next(r for r in events if r['type']=='done')
data=json.loads(Path(done['files'][0]).read_text(encoding='utf-8'))
result={'id':'BE10','extract':extract,'segments':data['segments'],'warnings':done.get('warnings')}
(OUT/'resume-observations.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(result,ensure_ascii=False,indent=2))
# Control without resume: every emitted cue receives the same known speaker.
a.resume=False;work.mkdir(exist_ok=True);events=[]
with patch.dict(sys.modules,{'faster_whisper':fake}),patch.object(T,'find_ffmpeg',return_value='fixture'),patch.object(T,'extract_audio',side_effect=wav_stub),patch.object(T,'check_vram_budget'),patch.object(T,'job_temp_directory',return_value=str(work)),patch.object(T,'run_diarization',return_value=[(0.,4.,'SPEAKER_00')]),patch.object(T,'emit',side_effect=lambda typ,**v:events.append(dict(type=typ,**v))):
 T.transcribe(a)
control=json.loads(Path(next(r for r in events if r['type']=='done')['files'][0]).read_text(encoding='utf-8'))
result['no_resume_control_speakers']=[s['speaker'] for s in control['segments']]
(OUT/'resume-observations.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
