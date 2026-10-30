import sys,os,json,wave,subprocess
from pathlib import Path
OUT=Path(__file__).parent
with wave.open(str(OUT/'sync-source.wav'),'wb') as f:f.setnchannels(1);f.setsampwidth(2);f.setframerate(16000);f.writeframes(b'\0\0'*16000*4)
(OUT/'sync-source.srt').write_text('1\n00:00:00,000 --> 00:00:02,000\nA short synthetic cue.\n',encoding='utf-8')
owner=OUT/'main-owned';owner.mkdir(exist_ok=True);(owner/'cancel.flag').unlink(missing_ok=True)
env=os.environ.copy();env['WHISPER_JOB_TEMP_DIR']=str(owner);env['WHISPER_CANCEL_FILE']=str(owner/'cancel.flag')
before_paths=set((OUT/'system-temp').glob('whisper_sync_*/audio.wav'))
p=subprocess.Popen([sys.executable,str(OUT/'sync-worker.py')],stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,encoding='utf-8',env=env)
lines=[]
try:
 for line in p.stdout:
  lines.append(line.strip())
  if 'EXTRACTED_READY' in line:break
 assert any('EXTRACTED_READY' in line for line in lines),'Worker did not reach the post-FFmpeg checkpoint'
 (owner/'cancel.flag').write_text('cancel',encoding='utf-8')
 p.terminate();p.wait(timeout=10)
finally:
 if p.poll() is None:p.kill();p.wait(timeout=10)
leftovers=[{'path':str(f.relative_to(OUT)),'bytes':f.stat().st_size,'under_main_owned':f.is_relative_to(owner)} for f in (OUT/'system-temp').glob('whisper_sync_*/audio.wav') if f not in before_paths]
r={'id':'XB06','worker_exit':p.returncode,'leftovers':leftovers,'owned_contents':[f.name for f in owner.iterdir()],'events':lines}
(OUT/'sync-observations.json').write_text(json.dumps(r,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(r,ensure_ascii=False,indent=2))
# The normal exit executes finally cleanup; cancellation marker alone is ignored.
sys.path.insert(0,str(OUT.resolve().parents[1]/'backend'))
import transcribe as T
from types import SimpleNamespace as NS
from unittest.mock import patch
normal=OUT/'normal-temp';normal.mkdir(exist_ok=True);T.tempfile.tempdir=str(normal)
events=[]
import pipeline_control as P
original_extract=T.extract_audio
(owner/'cancel.flag').unlink(missing_ok=True)
def mark_after_extract(*a,**kw):
 result=original_extract(*a,**kw)
 (owner/'cancel.flag').write_text('cancel',encoding='utf-8')
 return result
with patch.object(P,'_CANCELLATION',P.CancellationController(str(owner/'cancel.flag'))),patch.object(T,'extract_audio',side_effect=mark_after_extract),patch.object(T,'emit',side_effect=lambda kind,**v:events.append({'type':kind,**v})),patch.dict(os.environ,env):
 T.sync_subtitles(NS(input=str(OUT/'sync-source.wav'),sync_srt=str(OUT/'sync-source.srt'),output_dir=str(OUT),sync_fix_framerate=False,sync_max_shift=60,sync_piecewise=False,language='en'))
r['normal_exit_scratch_leftovers']=[str(f) for f in normal.glob('whisper_sync_*')]
r['cancel_marker_was_present']=Path(env['WHISPER_CANCEL_FILE']).exists()
r['completed_despite_marker']=any(e['type']=='done' for e in events)
r['outputs_written_despite_marker']=next(e['files'] for e in events if e['type']=='done')
(OUT/'sync-observations.json').write_text(json.dumps(r,ensure_ascii=False,indent=2),encoding='utf-8')
