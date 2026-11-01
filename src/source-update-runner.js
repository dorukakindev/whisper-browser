'use strict';
// Copied into the update job directory before quitting, so its own code cannot
// change during the fast-forward. No shell interpolation or reset/clean/stash.
const fs=require('node:fs'),path=require('node:path'),{execFileSync,spawn}=require('node:child_process');
async function run(job,{alive=pid=>{try{process.kill(pid,0);return true;}catch(e){return e.code!=='ESRCH';}},sleep=ms=>new Promise(r=>setTimeout(r,ms)),limit=120000}={}){
 const result={ok:false,target:job.target};
 const git=args=>execFileSync('git',['-C',job.root,...args],{windowsHide:true,timeout:45000,maxBuffer:2*1024*1024,encoding:'utf8',env:{...process.env,GIT_TERMINAL_PROMPT:'0',GCM_INTERACTIVE:'never'}}).trim();
 try{
  if(!/^[a-f0-9]{40}$/.test(job.head)||!/^[a-f0-9]{40}$/.test(job.target)||!Number.isSafeInteger(job.pid)||job.pid<=0)throw Error('Invalid update job');
  const deadline=Date.now()+limit;while(alive(job.pid)){if(Date.now()>deadline)throw Error('Application did not close; update was not applied');await sleep(200);}
  if(!/^https:\/\/github\.com\/dorukakindev\/whisper-browser(?:\.git)?\/?$/i.test(git(['remote','get-url','origin']))||git(['branch','--show-current'])!=='master'||git(['rev-parse','HEAD'])!==job.head)throw Error('Source installation changed; update was not applied');
  git(['merge-base','--is-ancestor',job.head,job.target]);git(['merge','--ff-only','--quiet',job.target]);if(git(['rev-parse','HEAD'])!==job.target)throw Error('Unexpected update result');result.ok=true;
 }catch(e){result.error=String(e.message).split('\n')[0].slice(0,500);}
 fs.writeFileSync(job.result,JSON.stringify(result,null,2));
 if(job.launch!==false){const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;const child=spawn(job.electron,[job.root],{cwd:job.root,env,detached:true,windowsHide:true,stdio:'ignore'});child.once('error',()=>{});child.unref();}
 return result;
}
if(require.main===module){run(JSON.parse(fs.readFileSync(process.argv[2],'utf8'))).catch(()=>{process.exitCode=1;});}
module.exports={run};
