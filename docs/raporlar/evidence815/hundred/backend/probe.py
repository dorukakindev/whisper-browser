import sys,json,ast,contextlib,io,wave,hashlib,threading,http.server,urllib.parse,subprocess
from pathlib import Path
from types import SimpleNamespace as NS,ModuleType
from unittest.mock import patch
ROOT=Path(__file__).resolve().parents[2];OUT=Path(__file__).parent;sys.path[:0]=[str(ROOT/'backend'),str(ROOT/'tools/voxcpm2')]
import transcribe as T
import media as M
from test_transcribe import _fake_openai
OBS=[]
def llmargs(**kw):
 d=dict(llm_api_key='controlled-fixture-not-a-key',llm_base_url='https://example.invalid/v1',llm_model='fixture',llm_fix_censorship=False,llm_fix_hallucination=False,llm_fix_punctuation=True,llm_fix_consistency=False,llm_workers=1,glossary='');d.update(kw);return NS(**d)
def cleanup(entries,answer=None,error=None,**opts):
 calls=[];events=[];warnings=[]
 class Client:
  def __init__(self,**k):self.chat=NS(completions=self)
  def create(self,**kw):
   payload=json.loads(kw['messages'][-1]['content']);calls.append(payload)
   if error:raise error
   data=answer(payload) if callable(answer) else answer
   return NS(choices=[NS(message=NS(content=json.dumps(data)),finish_reason='stop')])
 with _fake_openai(Client),patch.object(T,'emit',side_effect=lambda kind,**v:events.append({'type':kind,**v})):
  result=T.llm_postprocess(entries,llmargs(**opts),warnings)
 return result,calls,events,warnings
orig='Please do not open the red door.'
r,c,e,w=cleanup([(0.,3.,orig)],{'0':'Please open the red door now.'})
OBS.append({'id':'HB01','input':orig,'result':r,'calls':len(c),'warnings':w,'progress':[x for x in e if x['type']=='llm_progress']})
expansion=' '.join(['Invented content']*400)+'.'
r,c,e,w=cleanup([(0.,3.,'Hello.')],{'0':expansion});control,_,_,_=cleanup([(0.,3.,'This is original text.')],{'0':expansion})
OBS.append({'id':'HB02','input':'Hello.','output_chars':len(r[0][2]),'output_words':len(r[0][2].split()),'warnings':w,'four_word_control':control,'progress':[x for x in e if x['type']=='llm_progress']})
error=RuntimeError('invalid_api_key');error.status_code=401
r,c,e,w=cleanup([(float(i),float(i+1),f'Ordinary spoken line {i}.') for i in range(90)],error=error)
OBS.append({'id':'HB03','calls_after_fatal401':len(c),'expected_calls':1,'result_preserved':r[0][2]=='Ordinary spoken line 0.','warnings':w,'progress':[x for x in e if x['type']=='llm_progress']})
r,c,e,w=cleanup([(0.,3.,'Hello world.')],{'0':'Hello, world.'},llm_api_key='')
OBS.append({'id':'CANDIDATE-missingkey','warnings':w,'events':e})
# Actual local FFmpeg/HTTP download consumer.
ff=T.find_ffmpeg();video=OUT/'fixture-video.mp4';audio=OUT/'fixture-audio.webm'
def ffcall(*a):
 r=subprocess.run([ff,'-nostdin','-v','error','-y',*map(str,a)],capture_output=True,timeout=30)
 if r.returncode:raise RuntimeError(r.stderr.decode('utf-8','replace')[-1500:])
ffcall('-f','lavfi','-i','testsrc2=size=64x64:rate=10:duration=1','-c:v','libx264','-an',video)
ffcall('-f','lavfi','-i','sine=frequency=440:duration=1','-c:a','libvorbis','-vn',audio)
state={'fail':False}
class Handler(http.server.BaseHTTPRequestHandler):
 def log_message(self,*a):pass
 def do_GET(self):
  if state['fail']:self.send_error(404);return
  f=audio if self.path.startswith('/audio') else video;data=f.read_bytes();self.send_response(200);self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data)
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),Handler);thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start();base=f'http://127.0.0.1:{server.server_port}';downloads=OUT/'downloads';events=[]
try:
 with patch.object(M,'emit',side_effect=lambda kind,**v:events.append({'type':kind,**v})):
  M.download_stream(base+'/video?mime=video%2Fmp4','', 'Synthetic media',720,'en',str(downloads),'fixture')
  target=Path(next(e['path'] for e in events if e['type']=='downloaded'));before=target.read_bytes();state['fail']=True
  try:M.download_stream(base+'/video?mime=video%2Fmp4','', 'Synthetic media',720,'en',str(downloads),'fixture')
  except Exception as er:failure=type(er).__name__
  OBS.append({'id':'HB04','first_success':True,'before_sha256':hashlib.sha256(before).hexdigest(),'before_bytes':len(before),'second_failure':failure,'old_final_exists':target.exists()})
  state['fail']=False
  try:
   M.download_stream(base+'/video?mime=video%2Fmp4',base+'/audio?mime=audio%2Fwebm','Vorbis mixed',720,'en',str(downloads),'vorbis');outcome='success'
  except Exception as er:outcome=str(er)
  OBS.append({'id':'CANDIDATE-container','outcome':outcome})
finally:server.shutdown();server.server_close();thread.join(2)
(OUT/'observations.json').write_text(json.dumps(OBS,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(OBS,ensure_ascii=False,indent=2))
# Real yt-dlp downloader/selector against two loopback language tracks.
import yt_dlp
actual_YDL=yt_dlp.YoutubeDL
english=OUT/'lang-en.webm';turkish=OUT/'lang-tr.webm'
ffcall('-f','lavfi','-i','sine=frequency=440:duration=1','-c:a','libopus','-vn',english)
ffcall('-f','lavfi','-i','sine=frequency=880:duration=1','-c:a','libopus','-vn',turkish)
http_hits=[]
class LangHandler(http.server.BaseHTTPRequestHandler):
 def log_message(self,*a):pass
 def do_GET(self):
  http_hits.append(self.path);data=(turkish if self.path=='/tr' else english).read_bytes();self.send_response(200);self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data)
sv=http.server.ThreadingHTTPServer(('127.0.0.1',0),LangHandler);th=threading.Thread(target=sv.serve_forever,daemon=True);th.start();url=f'http://127.0.0.1:{sv.server_port}'
formats=[{'format_id':lang,'url':url+'/'+lang,'ext':'webm','acodec':'opus','vcodec':'none','language':lang,'abr':64} for lang in ['en','tr']]
class FixtureYDL:
 def __init__(self,opts):self.real=actual_YDL(opts)
 def __enter__(self):return self
 def __exit__(self,*a):self.real.close()
 def extract_info(self,*a,**kw):return self.real.process_ie_result({'id':'LANGFIXTURE','title':'Synthetic language fixture','extractor':'synthetic','webpage_url':url,'formats':[dict(r) for r in formats]},download=True)
try:
 folder=OUT/'language-download';folder.mkdir(exist_ok=True)
 # The probe can be re-run; isolate new synthetic output each run.
 import tempfile
 folder=Path(tempfile.mkdtemp(prefix='case-',dir=folder))
 with patch.object(yt_dlp,'YoutubeDL',FixtureYDL),patch.object(T,'emit'):
  p1,_,_=T.download_youtube(url,str(folder),ff,audio_lang='en');h1=hashlib.sha256(Path(p1).read_bytes()).hexdigest()
  hits1=list(http_hits)
  p2,_,_=T.download_youtube(url,str(folder),ff,audio_lang='tr');h2=hashlib.sha256(Path(p2).read_bytes()).hexdigest()
  hits2=list(http_hits)
  controlfolder=folder/'fresh';controlfolder.mkdir();p3,_,_=T.download_youtube(url,str(controlfolder),ff,audio_lang='tr');h3=hashlib.sha256(Path(p3).read_bytes()).hexdigest()
 OBS.append({'id':'HB05','english_sha':h1,'requested_tr_sha':h2,'fresh_tr_sha':h3,'same_output_path':str(p1)==str(p2),'hits_after_en':hits1,'hits_after_cached_tr':hits2,'all_hits':list(http_hits),'returned_existing_en_for_tr':h1==h2 and h2!=h3})
finally:sv.shutdown();sv.server_close();th.join(2)
(OUT/'observations.json').write_text(json.dumps(OBS,ensure_ascii=False,indent=2),encoding='utf-8');print('LANG',json.dumps(OBS[-1],ensure_ascii=False))
# Full transcription consumer: real FFmpeg, pipeline, writers; controlled ASR/editor.
def pipeline(original,edited,reason,label):
 main=next(n for n in ast.parse((ROOT/'backend/transcribe.py').read_text(encoding='utf-8')).body if isinstance(n,ast.FunctionDef) and n.name=='main');prefix=[]
 for n in main.body:
  if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='args' for t in n.targets):break
  prefix.append(n)
 env=dict(T.__dict__);exec(compile(ast.Module(body=prefix,type_ignores=[]),'real-parser','exec'),env)
 source=OUT/'pipeline-source.wav'
 with wave.open(str(source),'wb') as f:f.setnchannels(1);f.setsampwidth(2);f.setframerate(16000);f.writeframes(b'\0\0'*16000*3)
 out=OUT/('pipeline-'+label);out.mkdir(exist_ok=True)
 a=env['parser'].parse_args(['--input',str(source),'--output-dir',str(out),'--device','cpu','--compute-type','int8','--llm-postprocess','true','--llm-api-key','fixture-not-a-key','--llm-base-url','https://example.invalid','--llm-model','fixture','--llm-fix-censorship','false','--llm-fix-hallucination','false','--llm-fix-punctuation','true','--llm-fix-consistency','false','--fix-timings','false','--snap-to-speech','false','--split-mode','none','--fix-common-errors','false','--drop-repeated-hallucinations','false','--formats','srt','--resume','false'])
 a.scene_context=None
 class Model:
  def __init__(self,*a,**k):pass
  def transcribe(self,*a,**k):return iter([NS(start=0.,end=3.,text=original,words=[])]),NS(language='en',language_probability=1.,duration=3.)
 class Editor:
  def __init__(self,**kw):self.chat=NS(completions=self)
  def create(self,**kw):return NS(choices=[NS(message=NS(content=json.dumps({'0':edited})),finish_reason=reason)])
 fake=ModuleType('faster_whisper');fake.WhisperModel=Model;events=[];work=out/'scratch';work.mkdir(exist_ok=True)
 with patch.dict(sys.modules,{'faster_whisper':fake}),_fake_openai(Editor),patch.object(T,'job_temp_directory',return_value=str(work)),patch.object(T,'check_vram_budget'),patch.object(T,'emit',side_effect=lambda kind,**v:events.append({'type':kind,**v})):
  T.transcribe(a)
 done=next(e for e in events if e['type']=='done');payload=Path(done['files'][0]).read_text(encoding='utf-8-sig')
 return {'artifact':str(Path(done['files'][0]).relative_to(OUT)),'sha256':hashlib.sha256(Path(done['files'][0]).read_bytes()).hexdigest(),'output_text':payload,'warnings':done['warnings'],'done':True,'progress':[e for e in events if e['type']=='llm_progress']}
OBS[0]['full_consumer']=pipeline('Please do not open the red door.','Please open the red door now.','stop','meaning')
OBS[1]['full_consumer']=pipeline('Hello.',expansion,'stop','expansion')
original='The first part explains why the door must stay shut. The last part contains the warning that must never disappear.'
truncated='The first part explains why the door must stay shut.'
consumer=pipeline(original,truncated,'length','length')
OBS.append({'id':'HB06','original':original,'provider_finish_reason':'length','provider_text':truncated,'full_consumer':consumer})
(OUT/'observations.json').write_text(json.dumps(OBS,ensure_ascii=False,indent=2),encoding='utf-8');print('CONSUMER',json.dumps({'HB01':OBS[0]['full_consumer'],'HB02_output_chars':len(OBS[1]['full_consumer']['output_text']),'HB06':OBS[-1]},ensure_ascii=False))
from test_transcribe import _TrArgs,_sentence_translate
source=[(float(i),float(i+1),f'Ordinary spoken line {i}.') for i in range(90)]
def deny(_):
 er=RuntimeError('invalid_api_key');er.status_code=401;raise er
rr,cc,ee,ww=_sentence_translate(source,_TrArgs(translate_cache=False,translate_workers=1),deny)
next(r for r in OBS if r['id']=='HB03')['translation_fatal_control_calls']=len(cc)
# Punctuation correction itself remains supported by the cleanup consumer.
rc,_,_,_=cleanup([(0.,3.,'hello world')],{'0':'Hello, world.'})
next(r for r in OBS if r['id']=='HB01')['punctuation_control']=rc
(OUT/'observations.json').write_text(json.dumps(OBS,ensure_ascii=False,indent=2),encoding='utf-8');print('CONTROLS',len(cc),rc)
next(r for r in OBS if r['id']=='HB01')['full_punctuation_control']=pipeline('hello world','Hello, world.','stop','punctuation-control')
next(r for r in OBS if r['id']=='HB02')['full_four_word_control']=pipeline('This is original text.',expansion,'stop','size-control')
next(r for r in OBS if r['id']=='HB06')['full_stop_control']=pipeline(original,original,'stop','length-control')
(OUT/'observations.json').write_text(json.dumps(OBS,ensure_ascii=False,indent=2),encoding='utf-8')
print('FINAL_CONTROLS',json.dumps({'HB01':next(r for r in OBS if r['id']=='HB01')['full_punctuation_control'],'HB02':next(r for r in OBS if r['id']=='HB02')['full_four_word_control'],'HB06':next(r for r in OBS if r['id']=='HB06')['full_stop_control']},ensure_ascii=False))
