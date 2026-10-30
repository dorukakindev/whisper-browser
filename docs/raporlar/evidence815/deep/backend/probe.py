import sys,json,hashlib
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
ROOT=Path(__file__).resolve().parents[2]
sys.path[:0]=[str(ROOT/'backend'),str(ROOT/'tools/voxcpm2')]
import transcribe as T
import dub_plan as D
from dub_quality import speech_check,generation_status
OUT=Path(__file__).parent
results=[]
def args(source,target='tr',**kw):
 d=dict(input=str(source),output_dir=str(OUT),language='en',translate_to=target,translate_model='fixture',translate_base_url='https://example.invalid',max_line_width=42,max_lines=2,wrap_mode='none',formats='srt',dual_subtitle=False,dual_translation_first=True,translate_existing='',max_cps=21)
 d.update(kw);return SimpleNamespace(**d)
def run(a,transform=None):
 events=[]; calls=[]
 def fake(entries,_a,warn,source_lang=None,status_out=None,precompleted=None):
  calls.append(entries);status_out.update(completed=list(range(len(entries))),failed=[])
  return [(s,e,transform(t) if transform else 'Türkçe karşılık hazır.') for s,e,t in entries]
 with patch.object(T,'emit',side_effect=lambda k,**v:events.append(dict(type=k,**v))),patch.object(T,'llm_translate',side_effect=fake):T.translate_existing_subtitle(a)
 return events,calls
# End-to-end multi-target dual output collision.
p=OUT/'dual-source.en.srt';T.write_srt([(0,2,'The report is ready.')],p,wrap_mode='none')
e,c=run(args(p,'tr',dual_subtitle=True),lambda _:'Rapor hazır.')
dual=OUT/'dual-source.dual.srt';before=dual.read_text(encoding='utf-8-sig')
e,c=run(args(p,'de',dual_subtitle=True),lambda _:'Der Bericht ist fertig.')
after=dual.read_text(encoding='utf-8-sig')
results.append(dict(id='BE01',kind='dual_language_collision',before=before,after=after,tr_file_exists=(OUT/'dual-source.tr.srt').exists(),de_file_exists=(OUT/'dual-source.de.srt').exists()))
# Valid mixed language file: a short TR opening before long English body.
p=OUT/'mixed.srt';entries=[(i*2,i*2+1,'Bu iş için şimdi hazırız.' if i<40 else 'We need to finish this important report.') for i in range(100)]
T.write_srt(entries,p,wrap_mode='none');e,c=run(args(p,language='auto',translate_for_speech=True))
done=next(v for v in e if v['type']=='done');text=Path(done['files'][0]).read_text(encoding='utf-8-sig')
results.append(dict(id='BE02',kind='mixed_auto_skip',calls=len(c),untranslated_english=text.count('We need to finish'),output_status=done['outputs'][0]['status'],failed=done['outputs'][0]['failed']))
# Negative control explicit EN calls the translator.
_,c=run(args(p,language='en',translate_for_speech=True));results[-1]['explicit_en_calls']=len(c)
# ASS drawing mode reaches real translation boundary as narrative text.
p=OUT/'drawing.ass';p.write_text('[Script Info]\nScriptType: v4.00+\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:00:01.00,0:00:02.00,Default,,0,0,0,,{\\p1}m 0 0 l 100 0 100 100{\\p0}\nDialogue: 0,0:00:03.00,0:00:04.00,Default,,0,0,0,,Hello there.\n',encoding='utf-8')
e,c=run(args(p));results.append(dict(id='BE03',kind='ass_drawing_as_speech',provider_input=c[0]))
# SRT time-range body: backend parser preserves literal range, dub parser consumes it.
p=OUT/'body-range.srt';p.write_text('1\n00:00:01,000 --> 00:00:05,000\nUse this interval:\n00:00:02,000 --> 00:00:03,000\nfor the title.\n\n2\n00:00:06,000 --> 00:00:08,000\nContinue with the next scene.\n',encoding='utf-8')
results.append(dict(id='BE04',kind='dub_literal_range_phantom_cue',backend=T.parse_subtitle_entries(p.read_text(),'.srt'),dub=D.plan(p,grouping='satir')))
# Semantically reversed actual ASR wording still marks verified voice ready.
base='Bu kapsamlı raporda belirtilen bütün teknik ayrıntıları dikkatlice inceleyerek bugün toplantıda ekip arkadaşlarımla birlikte değerlendirdim. '
pairs=[('name',base+'Mehmet toplantıya katıldı.',base+'Ahmet toplantıya katıldı.'),('order',base+'Ali beş, Ayşe on kitap aldı.',base+'Ali on, Ayşe beş kitap aldı.'),('verb',base+'Sonunda işlemi başlattım.',base+'Sonunda işlemi başlatmadım.')]
for label,expected,actual in pairs:
 r=speech_check(expected,actual);results.append(dict(id='QUALITY-'+label,expected=expected,actual=actual,result=r,generation=generation_status(0,{'status':'review' if r['review'] else 'passed',**r})))
(OUT/'observations.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(results,ensure_ascii=False,indent=2))

# Additional real pipeline checks, appended to probe for repeatability.
p=OUT/'literal-tags.vtt';p.write_text('WEBVTT\n\n00:00:01.000 --> 00:00:04.000\nType &lt;b&gt;hello&lt;/b&gt; to enter the tag.\n',encoding='utf-8')
e,c=run(args(p,'en',formats='vtt',language='en'))
vtt_text=Path(next(v for v in e if v['type']=='done')['files'][0]).read_text(encoding='utf-8')
results.append(dict(id='BE07',kind='vtt_literal_tag_reinterpreted',source=p.read_text(encoding='utf-8'),output=vtt_text,provider_calls=len(c)))
# Run the actual SpeechVerifier class without importing or starting the GPU engine.
import ast,asyncio
source=ast.parse((ROOT/'tools/voxcpm2/altyazi_oku.py').read_text(encoding='utf-8'))
klass=next(n for n in source.body if isinstance(n,ast.ClassDef) and n.name=='SpeechVerifier')
globals_={'asyncio':asyncio,'json':json,'speech_check':speech_check}
exec(compile(ast.Module(body=[klass],type_ignores=[]),str(ROOT/'tools/voxcpm2/altyazi_oku.py'),'exec'),globals_)
class Sink:
 def write(self,_):pass
 async def drain(self):pass
class Response:
 def __init__(self,text):self.text=text
 async def readline(self):return json.dumps({'text':self.text,'language':'tr'}).encode()
async def verify(expected,actual):
 verifier=globals_['SpeechVerifier']('fixture-python')
 verifier.proc=SimpleNamespace(stdin=Sink(),stdout=Response(actual))
 return await verifier.check(OUT/'controlled-unused.wav',expected)
for row in results:
 if row['id'] in ['QUALITY-name','QUALITY-order']:
  row['verifier']=asyncio.run(verify(row['expected'],row['actual']))
  row['negative_control_identical']=speech_check(row['expected'],row['expected'])['review']
results.append(dict(id='CONTROL-quantity-loss',review=speech_check(base+'Ali beş, Ayşe on kitap aldı.',base+'Ali beş, Ayşe kitap aldı.')['review']))
(OUT/'observations.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
print('ADDITIONAL',json.dumps(results[-2:],ensure_ascii=False))
# Inline WebVTT timestamp is control markup, never a spoken literal.
p=OUT/'karaoke.vtt';p.write_text('WEBVTT\n\n00:00:01.000 --> 00:00:04.000\nHello <00:00:02.000>world.\n',encoding='utf-8')
e,c=run(args(p,'tr'))
results.append(dict(id='BE08',kind='vtt_inline_timestamp_sent_as_dialogue',provider_input=c[0]))
(OUT/'observations.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
print('INLINE',json.dumps(results[-1],ensure_ascii=False))
e,c=run(args(p,'en',formats='vtt',language='en'))
results[-1]['same_language_output']=Path(next(v for v in e if v['type']=='done')['files'][0]).read_text(encoding='utf-8')
(OUT/'observations.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
# Exact cache separates user scene notes; fuzzy TM incorrectly ignores them.
from test_transcribe import _TrArgs,_sentence_translate
cache=OUT/'notes-cache';cache.mkdir(exist_ok=True)
for item in cache.glob('*'):
 if item.is_file():item.unlink()
text=[(0.,3.,'The bank is very close.')]
a=_TrArgs(cache_dir=str(cache),input='ambiguous.srt',scene_context={'location':'financial district'})
first,seen,_,_=_sentence_translate(text,a,lambda payload:{'items':{'0':'Banka çok yakın.'},'sentences':{'0':'Banka çok yakın.'}})
b=_TrArgs(cache_dir=str(cache),input='ambiguous.srt',scene_context={'location':'river bank'})
second,seen2,_,_=_sentence_translate(text,b,lambda payload:{'items':{'0':'Nehir kıyısı çok yakın.'},'sentences':{'0':'Nehir kıyısı çok yakın.'}})
results.append(dict(id='BE09',kind='tm_ignores_scene_notes',first=first,second=second,first_calls=len(seen),second_calls=len(seen2),exact_cache_keys_differ=T.translate_cache_key(text[0][2],a,'tr','en')!=T.translate_cache_key(text[0][2],b,'tr','en')))
(OUT/'observations.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
print('TM',json.dumps(results[-1],ensure_ascii=False))
# Negative control: disable all cache and the updated notes reach the provider.
b.translate_cache=False
fresh,seen3,_,_=_sentence_translate(text,b,lambda payload:{'items':{'0':'Nehir kıyısı çok yakın.'},'sentences':{'0':'Nehir kıyısı çok yakın.'}})
results[-1].update(cache_disabled=fresh,cache_disabled_calls=len(seen3))
(OUT/'observations.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
