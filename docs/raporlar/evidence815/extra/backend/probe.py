import sys,json,asyncio,io,wave,ast
from pathlib import Path
from types import SimpleNamespace as NS,ModuleType
from unittest.mock import patch
ROOT=Path(__file__).resolve().parents[2];OUT=Path(__file__).parent
sys.path[:0]=[str(ROOT/'backend'),str(ROOT/'tools/voxcpm2')]
import transcribe as T
import live_asr as L
import browser_align as A
from dub_runtime import EngineSession
import dub_runtime as R
from dub_plan import plan
results=[]
def trargs(p):return NS(input=str(p),output_dir=str(OUT),language='en',translate_to='en',translate_model='fixture',translate_base_url='https://example.invalid',max_line_width=42,max_lines=2,wrap_mode='none',formats='vtt',dual_subtitle=False,dual_translation_first=True,translate_existing='',max_cps=21)
for body in ['NOTE this is spoken dialogue.','STYLE','REGION']:
 p=OUT/('vtt-'+body.split()[0]+'.vtt');p.write_text('WEBVTT\n\n00:00:01.000 --> 00:00:04.000\n'+body+'\n',encoding='utf-8')
 try:
  with patch.object(T,'emit'):T.translate_existing_subtitle(trargs(p))
  outcome='success'
 except Exception as e:outcome=str(e)
 results.append({'case':body,'result':outcome,'parsed':T.parse_subtitle_entries(p.read_text(),'.vtt')})
first={'id':'XB01','cases':results,'control':T.parse_subtitle_entries('WEBVTT\n\n00:00:01.000 --> 00:00:04.000\nA spoken note.\n','.vtt')}
results=[first]
# Actual warm-session acquisition and cold control, no GPU process.
async def warm():
 made=[]
 class Server:
  servers=[]
  def __init__(self,*a,**kw):made.append(kw)
  async def wait_for_ready(self):pass
  async def stop(self):pass
 def args(n):return NS(steps=15,batch_tokens=2048,max_model_len=2048,gpu_mem=.8,eszamanli=n,requested_concurrency=n,configured_concurrency=n,ready_timeout=30)
 session=EngineSession();a=args(4);b=args(8)
 with patch.object(R,'choose_capacity',side_effect=lambda a:(a.configured_concurrency,.8)):
  await session.acquire(a,'fixture',Server,b'',None);await session.acquire(b,'fixture',Server,b'',None)
  count=len(made);actual=b.eszamanli
  await session.reset();c=args(8);await session.acquire(c,'fixture',Server,b'',None);await session.reset()
 return {'id':'XB02','first':a.eszamanli,'requested_second':8,'actual_second':actual,'factories_after_second':count,'cold_control_actual':c.eszamanli}
results.append(asyncio.run(warm()))
# Actual live ASR main, queues, language retry, events; provider controlled.
paths=[]
for i in range(5):
 p=OUT/f'chunk-{i}.wav'
 with wave.open(str(p),'wb') as f:f.setnchannels(1);f.setsampwidth(2);f.setframerate(16000);f.writeframes(b'\0\0'*16000)
 paths.append(p)
script=[('en',.95),('tr',.95),('de',.2),('tr',.95),('en',.2)];calls=[]
class Model:
 def __init__(self,*a,**kw):pass
 def transcribe(self,p,language=None,**kw):
  i=paths.index(Path(p));detected,prob=script[i];calls.append({'chunk':i,'forced':language})
  return iter([NS(start=0.,end=1.,text='Clear spoken sentence.')]),NS(language=language or detected,language_probability=.95 if language else prob)
feed=''.join(json.dumps({'type':'chunk','path':str(p),'offset':i})+'\n' for i,p in enumerate(paths))+json.dumps({'type':'stop'})+'\n'
events=[];fake=ModuleType('faster_whisper');fake.WhisperModel=Model
with patch.dict(sys.modules,{'faster_whisper':fake}),patch.object(sys,'argv',['live_asr.py','--device','cpu']),patch.object(sys,'stdin',io.StringIO(feed)),patch.object(L,'emit',side_effect=lambda k,**v:events.append({'type':k,**v})):
 rc=L.main()
results.append({'id':'XB03','calls':calls,'languages':[e['language'] for e in events if e['type']=='segment'],'rc':rc,'expected_final_forced':'en','actual_final_forced':calls[-1]['forced']})
# Actual align caller: tool output controlled; valid overlapping reference cues.
print('DEPENDENCIES')
try:
 import srt,ffsubsync
 from datetime import timedelta
 ref=[{'start':start,'end':start+3,'text':f'Speaker {n}'} for start in [0,20,40,60] for n in range(2)]
 target=[{'start':start+10,'end':start+20,'text':f'Speech {n}'} for start in [0,20,40,60] for n in range(2)]
 def fake_run(a):
  # Installed parser namespace uses output filename attribute srtout.
  targetpath=Path(a.srtout)
  targetpath.write_text(srt.compose([srt.Subtitle(index=i+1,start=timedelta(seconds=r['start']-10),end=timedelta(seconds=r['end']-10),content=r['text']) for i,r in enumerate(target)]),encoding='utf-8')
  return {'sync_was_successful':True}
 with patch.object(ffsubsync,'run',side_effect=fake_run),patch.dict('os.environ',{'WHISPER_ALIGN_TMPDIR':str(OUT)}):r=A.align({'referenceCues':ref,'targetCues':target})
 results.append({'id':'XB04','diagnostics':r['diagnostics'],'actual_union_coverage':.3})
except Exception as e:results.append({'id':'CANDIDATE-align','error':str(e)})
p=OUT/'speaker-label.srt';p.write_text('1\n00:00:00,000 --> 00:00:02,000\n[man] Hello there.\n',encoding='utf-8');results.append({'id':'CANDIDATE-speaker','plan':plan(p)})
(OUT/'observations.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(results,ensure_ascii=False,indent=2))
# Correct large quantities should not fail the actual verifier chain.
from dub_quality import speech_check,generation_status
from types import SimpleNamespace
s=ast.parse((ROOT/'tools/voxcpm2/altyazi_oku.py').read_text(encoding='utf-8'))
klass=next(n for n in s.body if isinstance(n,ast.ClassDef) and n.name=='SpeechVerifier');scope={'asyncio':asyncio,'json':json,'speech_check':speech_check}
exec(compile(ast.Module(body=[klass],type_ignores=[]),'actualSpeechVerifier','exec'),scope)
class Sink:
 def write(self,_):pass
 async def drain(self):pass
class Answer:
 async def readline(self):return json.dumps({'text':'Dünya nüfusu 8 milyar insanı geçti.','language':'tr'}).encode()
async def big():
 v=scope['SpeechVerifier']('fixture');v.proc=NS(stdin=Sink(),stdout=Answer())
 expected='Dünya nüfusu sekiz milyar insanı geçti.'
 check=await v.check(OUT/'chunk-0.wav',expected,numeric_reference='Dünya nüfusu 8 milyar insanı geçti.')
 return {'id':'XB05','expected':expected,'actual':'Dünya nüfusu 8 milyar insanı geçti.','verification':check,'status':generation_status(0,check),'small_control_review':speech_check('Tam elli bin kişi geldi.','Tam 50 bin kişi geldi.')['review'],'wrong_control_review':speech_check(expected,'Dünya nüfusu 9 milyar insanı geçti.')['review']}
results.append(asyncio.run(big()))
(OUT/'observations.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8');print('BIG',json.dumps(results[-1],ensure_ascii=False))
from test_transcribe import _TrArgs,_sentence_translate
from series_memory import SeriesMemory
cache=OUT/'series-cache';cache.mkdir(exist_ok=True)
# New cache each run; only own synthetic files.
import tempfile
cache=Path(tempfile.mkdtemp(prefix='series-',dir=cache))
input_name='Synthetic_Show.S01E02.srt';source=[(0.,3.,'The captain is nearby.')]
a=_TrArgs(cache_dir=str(cache),input=input_name)
reply=lambda wording:lambda p:{'items':{'0':wording},'sentences':{'0':wording}}
first,seen,_,_=_sentence_translate(source,a,reply('Kaptan yakınlarda.'))
memory,key=SeriesMemory.for_input(cache,'Synthetic_Show.S01E01.srt','en','tr')
changed=memory.merge({'terms':{'captain':'Reis'}},1,1)
memory2,_=SeriesMemory.for_input(cache,input_name,'en','tr');hint=memory2.build_hint((1,2))
second,seen2,_,_=_sentence_translate(source,a,reply('Reis yakınlarda.'))
a.translate_cache=False
fresh,seen3,_,_=_sentence_translate(source,a,reply('Reis yakınlarda.'))
results.append({'id':'XB07','first':first,'first_calls':len(seen),'canon_committed':changed,'new_hint':hint,'second':second,'second_calls':len(seen2),'uncached':fresh,'uncached_calls':len(seen3)})
(OUT/'observations.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8');print('SERIES',json.dumps(results[-1],ensure_ascii=False))
