import argparse,asyncio,contextlib,hashlib,json,multiprocessing,os,sys,time
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'tools/voxcpm2'))

def main():
 parser=argparse.ArgumentParser(description='Explicit real GPU lifecycle acceptance; last request delay is controlled.')
 parser.add_argument('--run',action='store_true')
 for name in ('engine','reference','transcript','output','verify-python'):parser.add_argument('--'+name,type=Path,required=True)
 options=parser.parse_args()
 if not options.run:parser.error('Explicit --run required')
 for file in (options.reference,options.transcript,options.verify_python):
  if not file.is_file():parser.error('Input file missing')
 os.environ.update(VOXCPM_ROOT=str(options.engine.resolve()),HF_HUB_OFFLINE='1',TRANSFORMERS_OFFLINE='1')
 from accept_dub import inspect_gpu
 if not inspect_gpu()['ready']:raise SystemExit('blocked_gpu')
 import altyazi_oku as r
 from dub_runtime import EngineSession,Phases
 import soundfile as sf
 folder=options.output.resolve();folder.mkdir(parents=True,exist_ok=False)
 source=folder/'scene.srt';source.write_text('1\n00:00:00,000 --> 00:00:06,000\nBugün birlikte bir kitap okuyacağız.\n\n2\n00:00:07,000 --> 00:00:13,000\nİkinci bölümde okumaya devam edeceğiz.\n',encoding='utf-8-sig')
 ref=options.reference.resolve();transcript=options.transcript.resolve()
 args=r.parse_args([str(source),str(ref),'--transcript',str(transcript),'--verification','detailed','--verify-python',str(options.verify_python.resolve()),'--eszamanli','2','--timing-mode','video'])
 session=EngineSession();args.runtime=session;args.phases=Phases();args.auto_capacity=True;args.reference_bytes=ref.read_bytes();args.configured_concurrency=2;args.requested_concurrency=2
 args.group_keys=['1','2'];args.group_seeds=[42,43];args.manual_groups=set();args.report_dir=folder;args.end_limit_ms=None;args.group_results=[]
 paths=[folder/'first.wav',folder/'second.wav'];cues=r.parse_srt(source);prompt=transcript.read_text(encoding='utf-8-sig').strip()
 original=session.acquire;pending=asyncio.Event();calls=[];wrapped=set()
 async def acquire(*a,**kw):
  server=await original(*a,**kw)
  if id(server) not in wrapped:
   wrapped.add(id(server));generate=server.generate
   async def delayed(text,**kwargs):
    if text.startswith('İkinci'):
     pending.set();await asyncio.Event().wait()
    calls.append(text)
    async for part in generate(text,**kwargs):yield part
   server.generate=delayed
  return server
 async def cancel_then_resume():
  session.acquire=acquire
  task=asyncio.create_task(r.uret(args,cues,paths,prompt))
  deadline=time.monotonic()+120
  while not paths[0].is_file() or not pending.is_set():
   if time.monotonic()>deadline:task.cancel();await asyncio.gather(task,return_exceptions=True);raise RuntimeError('Healthy group did not complete')
   await asyncio.sleep(.1)
  before=hashlib.sha256(paths[0].read_bytes()).hexdigest();began=time.monotonic();task.cancel()
  try:await task
  except asyncio.CancelledError:pass
  else:raise AssertionError('Cancellation swallowed')
  cancelled={'cancelSeconds':round(time.monotonic()-began,3),'firstAudioPreserved':paths[0].is_file(),'secondMissing':not paths[1].exists(),'engineReleased':session.server is None,'controlledDelay':'Second request held before real generate; not an actual GPU stall'}
  session.acquire=original
  await r.uret(args,cues,paths,prompt)
  resumed={'firstShaUnchanged':hashlib.sha256(paths[0].read_bytes()).hexdigest()==before,'generatedGroups':[x['group'] for x in args.group_results],'states':[r.cached_record(p)['status'] for p in paths]}
  oldserver=session.server
  samples,sr=sf.read(ref,dtype='float32');changed=folder/'changed.wav';sf.write(changed,samples*.92,sr)
  args.reference=changed;args.reference_bytes=changed.read_bytes();args.group_keys=['3'];args.group_seeds=[44]
  await r.uret(args,[(0,6000,'Referans değişti. Okumaya devam ediyoruz.')],[folder/'third.wav'],prompt)
  switched={'sameEngine':session.server is oldserver,'waveHashMatches':session.reference[0][0]==hashlib.sha256(args.reference_bytes).hexdigest(),'status':args.group_results[0]['status']}
  result={'cancelled':cancelled,'resumed':resumed,'referenceChange':switched,'passed':all(cancelled[k] for k in ('firstAudioPreserved','secondMissing','engineReleased')) and resumed['firstShaUnchanged'] and resumed['generatedGroups']==[2] and switched['sameEngine'] and switched['waveHashMatches']}
  (folder/'acceptance.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
  print('RELIABILITY_ACCEPTANCE '+json.dumps(result),flush=True)
 try:session.run(cancel_then_resume())
 finally:session.close()
if __name__=='__main__':multiprocessing.freeze_support();main()
