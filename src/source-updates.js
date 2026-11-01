'use strict';
const {execFile}=require('node:child_process');
const REMOTE=/^https:\/\/github\.com\/dorukakindev\/whisper-browser(?:\.git)?\/?$/i;
class UpdateError extends Error{constructor(code){super(code);this.code=code;}}
function git(root,args){return new Promise((resolve,reject)=>execFile('git',['-C',root,...args],{windowsHide:true,timeout:45000,maxBuffer:2*1024*1024,env:{...process.env,GIT_TERMINAL_PROMPT:'0',GCM_INTERACTIVE:'never'}},(error,stdout)=>error?reject(new UpdateError('failed')):resolve(stdout.trim())));}
async function inspect(root,expected){
 if(!REMOTE.test(await git(root,['remote','get-url','origin'])))throw new UpdateError('remote-changed');
 if(await git(root,['branch','--show-current'])!=='master')throw new UpdateError('unsupported');
 const head=await git(root,['rev-parse','HEAD']);if(expected&&head!==expected)throw new UpdateError('stale');
 return head;
}
async function preflight(root,base,target){
 await inspect(root,base);if(!/^[a-f0-9]{40}$/.test(target))throw new UpdateError('stale');
 try{await git(root,['merge-base','--is-ancestor',base,target]);}catch(_){throw new UpdateError('divergent');}
 const changed=(await git(root,['diff','--name-only',base,target])).split('\n').filter(Boolean);
 const dirty=[...(await git(root,['diff','--name-only'])).split('\n'),...(await git(root,['diff','--cached','--name-only'])).split('\n')].filter(Boolean);
 if(dirty.some(p=>changed.includes(p)))throw new UpdateError('dirty');
 if(changed.includes('package-lock.json'))throw new UpdateError('runtime-change');
 const old=JSON.parse(await git(root,['show',base+':package.json'])),next=JSON.parse(await git(root,['show',target+':package.json']));
 if(JSON.stringify(old.dependencies)!==JSON.stringify(next.dependencies)||old.devDependencies?.electron!==next.devDependencies?.electron||JSON.stringify(old.engines)!==JSON.stringify(next.engines))throw new UpdateError('runtime-change');
 return {head:base,target,changed};
}
function createSourceUpdates({root,isBusy,schedule,readLast=()=>null,runGit=git}){
 let pending=false,scheduled=false,checked=null;
 const failure=error=>({ok:false,state:'error',error:error.code||'failed'});
 async function status(){try{const current=await runGit(root,['rev-parse','HEAD']);const same=checked?.head===current;return {ok:true,state:'idle',channel:'master',current:current.slice(0,8),latest:same?checked.target.slice(0,8):'',available:!!same&&checked.target!==current,canInstall:!!same&&checked.target!==current&&!await isBusy(),sourceRoot:root,lastResult:readLast()};}catch(e){return failure(e);}}
 return {async request(input={}){
  if(!input||typeof input!=='object'||!['status','check','install'].includes(input.action))return failure(new UpdateError('unsupported'));
  if(pending||scheduled)return failure(new UpdateError('busy'));if(input.action==='status')return status();
  pending=true;try{
   if(input.action==='check'){
    const head=await inspect(root);await runGit(root,['fetch','--no-tags','--no-recurse-submodules','origin','master']);const target=await runGit(root,['rev-parse','refs/remotes/origin/master']);
    await preflight(root,head,target);checked={head,target};return {...await status(),state:'ready'};
   }
   if(!checked)throw new UpdateError('check-required');if(await isBusy())throw new UpdateError('busy');
   await preflight(root,checked.head,checked.target);if(checked.head===checked.target)return {...await status(),state:'ready'};
   if(await isBusy())throw new UpdateError('busy');scheduled=true;try{await schedule({...checked,root});}catch(e){scheduled=false;throw e;}return {ok:true,state:'restarting',restartRequired:true,current:checked.head.slice(0,8),latest:checked.target.slice(0,8),available:true,canInstall:false};
  }catch(e){return failure(e);}finally{pending=false;}
 }};
}
module.exports={createSourceUpdates,inspect,preflight,git,UpdateError};
