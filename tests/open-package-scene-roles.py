import json,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'backend'))
import test_transcribe as F
import speech_relations as R
source=[(0,2,'MARA owns the key.'),(3,5,'She gave him her key.'),(6,8,'ELIF owns the book.'),(9,11,'She gave him her book.'),(12,14,'The door closed.')]
translated=['Anahtar MARA\'ya ait.','Kadın ona kendi anahtarını verdi.','Kitap ELIF\'e ait.','Kadın ona kendi kitabını verdi.','Kapı kapandı.']
lookup={e[2]:t for e,t in zip(source,translated)}
def answer(payload):
 if 'source_items' in payload:
  return {'facts':[{'id':r['id'],'contrast_role':'unknown',**{field:'' for field in R._FIELDS}} for r in payload['source_items']]}
 parts={str(i['i']):lookup[i.get('t',i.get('src'))] for i in payload['items']}
 return {'items':parts,'sentences':{str(g['ids'][0]):' '.join(parts[str(i)] for i in g['ids']) for g in payload['sentence_groups']}}
def run(entries,**options):
 result,calls,events,warnings=F._sentence_translate(entries,F._TrArgs(translate_for_speech=True,translate_cache=False,**options),answer)
 return {'roleRequests':[p for p,_ in calls if 'source_items' in p], 'reviewRequests':[p for p,_ in calls if 'source_relations' in p], 'warnings':warnings,'requestCount':len(calls),'result':result}
joint=run(source)
isolated=run(source[2:])
two=[(0,2,source[1][2]),(5,7,source[3][2])]
scene2=run(two,translate_scene_gap=2)
scene8=run(two,translate_scene_gap=8)
marked=[(0,2,source[1][2]),(3,5,'EXT. GARDEN. She gave him her book.')]
lookup[marked[1][2]]='EXT. GARDEN. Kadın ona kendi kitabını verdi.'
sceneMarker=run(marked)
result={'realProduction':'test_transcribe._sentence_translate -> transcribe.llm_translate -> speech_relations.batches; controlled OpenAI response transport only','joint':joint,'isolated':isolated,'scene2':scene2,'scene8':scene8,'sceneMarker':sceneMarker,'originalBreaks':{'gap2':sorted(F.T.detect_scene_boundaries(two,gap_threshold=2)),'gap8':sorted(F.T.detect_scene_boundaries(two,gap_threshold=8)),'marker':sorted(F.T.detect_scene_boundaries(marked))}}
assert result['originalBreaks']['gap2']==[1] and result['originalBreaks']['marker']==[1]
assert result['originalBreaks']['gap8']==[]
assert len(joint['roleRequests'])==2 and 'ELIF' in json.dumps(joint['roleRequests'][1])
assert [r['scene'] for r in scene2['roleRequests'][0]['source_items']]==[0,1], 'Custom caller gap must reach role metadata'
assert [r['scene'] for r in sceneMarker['roleRequests'][0]['source_items']]==[0,1], 'EXT scene marker must reach role metadata'
assert [r['scene'] for r in scene8['roleRequests'][0]['source_items']]==[0,0], 'Safe same-scene control must remain together'
print(json.dumps({'originalBreaks':result['originalBreaks'],'gap2Roles':scene2['roleRequests'],'gap8Roles':scene8['roleRequests'],'markerRoles':sceneMarker['roleRequests'],'warnings':scene2['warnings']+sceneMarker['warnings']},ensure_ascii=False))
