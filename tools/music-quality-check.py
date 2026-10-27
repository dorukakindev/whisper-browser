"""Opt-in local CLAP characterization; no downloads and no human-quality verdict."""
import argparse,hashlib,json,sys,time,shutil,subprocess
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'backend'))
from music_similarity import search,rank_many,steer,MODEL,REVISION
from music_tags import text_features
FIXTURES={
 'vibe':('Kevin_MacLeod_-_Vibe_Ace.ogg','6c23aed3dd5aa57f2b1652ecab68d15d9b82ad257f54e639eb2880ca09bc118a'),
 'trumpet':('sorohanro_-_solo-trumpet-06.ogg','8374466fd3951d24509da6e799b132a0db0bdeda69d99c69d989a6888d3d727d'),
 'choice':('admiralbob77_-_Choice_-_Drum-bass.ogg','ac644f9645e7c15174e4a4f8561e4d1448d7f6e59ff6b0556b310ebbced879bc'),
 'nutcracker':('Kevin_MacLeod_-_P_I_Tchaikovsky_Dance_of_the_Sugar_Plum_Fairy.ogg','b5c1a3e26310e6618d3c124f458654cd235650fcb9db7d711302644566600484'),
 'brahms':('Hungarian_Dance_number_5_-_Allegro_in_F_sharp_minor_(string_orchestra).ogg','919b48aa4cc66a0357d2cd5728664c5ab8f15c4b3469460df4b59470d35d3e49')}
def main():
 p=argparse.ArgumentParser();p.add_argument('--fixtures',type=Path,required=True);p.add_argument('--model-dir',type=Path,required=True);p.add_argument('--output',type=Path,required=True);p.add_argument('--ffmpeg',default=shutil.which('ffmpeg'));p.add_argument('--ffprobe',default=shutil.which('ffprobe'));a=p.parse_args()
 if not a.ffmpeg or not a.ffprobe:raise ValueError('Provide ffmpeg and ffprobe')
 began=time.monotonic();records=[];manifest=[]
 for id,(name,sha) in FIXTURES.items():
  file=a.fixtures/name;digest=hashlib.sha256(file.read_bytes()).hexdigest()
  if not sha or digest!=sha:raise ValueError('Fixture checksum mismatch: '+id)
  # Same up-to-ten-second sampling contract for every reference; no ground-truth taste labels.
  duration=float(json.loads(subprocess.check_output([a.ffprobe,'-v','error','-show_entries','format=duration','-of','json',str(file)]))['format']['duration'])
  selected=[0,min(10,duration)]
  record=search({'reference':{'id':id,'path':str(file)},'range':selected,'return_features':True,'cacheDir':str(a.output.parent/'cache'),'ffmpeg':a.ffmpeg,'ffprobe':a.ffprobe},a.model_dir);records.append(record);manifest.append({'id':id,'file':name,'sha256':digest,'range':selected})
 prompts=['The sound of a trumpet in a music recording.','Classical orchestral string music.','Electronic drum and bass music.'];vectors=text_features(prompts,a.model_dir)
 rows=[]
 for reference in records:
  candidates=[r for r in records if r['id']!=reference['id']];hits=rank_many([reference],candidates,False,len(candidates));rows.append({'reference':reference['id'],'audio':hits,'directions':[{'text':text,'weight':.6,'results':steer(hits,candidates,vectors[i],.6)} for i,text in enumerate(prompts)]})
 result={'model':MODEL,'revision':REVISION,'seconds':round(time.monotonic()-began,2),'fixtures':manifest,'rows':rows,'humanEvaluation':'not performed','scope':'Five tracks, first up to ten seconds only. A characterization, not genre accuracy or subjective recommendation quality.'}
 a.output.write_text(json.dumps(result,indent=2,allow_nan=False),encoding='utf-8');print(json.dumps({'output':str(a.output),'tracks':len(records),'seconds':result['seconds']}))
if __name__=='__main__':main()
