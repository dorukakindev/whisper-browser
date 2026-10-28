import os,sys,json,subprocess,threading,time
from pathlib import Path
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
root=Path(sys.argv[2]).resolve()
project=Path(sys.argv[1]).resolve()
requests=[]
class Handler(BaseHTTPRequestHandler):
 def log_message(self,*args):pass
 def do_POST(self):
  body=json.loads(self.rfile.read(int(self.headers['Content-Length'])))
  message=body['messages'][-1]['content']
  try:payload=json.loads(message)
  except (ValueError,TypeError):payload={}
  groups=payload.get('sentence_groups',[])
  items={};sentences={}
  for group in groups:
   source=group.get('source','').lower()
   text=('Kütüphane bugün açık. ' if 'library' in source else '')+('Birlikte bir kitap okuyabiliriz.' if 'book' in source else '')
   text=text.strip() or 'Kütüphane bugün açık. Birlikte bir kitap okuyabiliriz.'
   ids=group['ids'];words=text.split();parts=[]
   for n,i in enumerate(ids):
    part=' '.join(words[len(words)*n//len(ids):len(words)*(n+1)//len(ids)]);items[str(i)]=part;parts.append(part)
   sentences[str(ids[0])]=' '.join(parts)
  content=json.dumps({'sentences':sentences,'items':items,'memory':{}},ensure_ascii=False) if groups else 'OK'
  requests.append({'path':self.path,'model':body.get('model'),'groups':groups,'items':payload.get('items'),'response':content})
  data=json.dumps({'id':'controlled-loopback','choices':[{'index':0,'message':{'role':'assistant','content':content},'finish_reason':'stop'}],'usage':{'prompt_tokens':20,'completion_tokens':20,'total_tokens':40}}).encode()
  self.send_response(200);self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data)
server=ThreadingHTTPServer(('127.0.0.1',0),Handler);threading.Thread(target=server.serve_forever,daemon=True).start()
env=dict(os.environ,HF_HUB_OFFLINE='1',PYTHONUTF8='1',PYTHONIOENCODING='utf-8',WHISPER_TRANSLATE_API_KEY='fixture-only')
args=[sys.executable,str(project/'backend/transcribe.py'),'--input',str(root/'Türkçe kaynak.mp4'),'--output-dir',str(root/'translated'),'--model','tiny','--device','cpu','--compute-type','int8','--language','en','--split-mode','none','--vad-filter','false','--clip-start','2','--clip-end','10','--formats','srt,json','--translate','true','--translate-for-speech','true','--translate-base-url',f'http://127.0.0.1:{server.server_port}/v1','--translate-model','fixture-translation','--translate-workers','1','--translate-cache','false','--translate-refine','false']
start=time.monotonic()
with (root/'backend.out').open('w',encoding='utf-8') as out,(root/'backend.err').open('w',encoding='utf-8') as err:r=subprocess.run(args,env=env,stdout=out,stderr=err)
server.shutdown();(root/'requests.json').write_text(json.dumps(requests,ensure_ascii=False,indent=2),encoding='utf-8');(root/'backend-result.json').write_text(json.dumps({'exit':r.returncode,'seconds':round(time.monotonic()-start,3),'selected':[2,10],'sourceSeconds':14,'provider':'controlled loopback, not an LLM-quality test'},indent=2),encoding='utf-8');raise SystemExit(r.returncode)
