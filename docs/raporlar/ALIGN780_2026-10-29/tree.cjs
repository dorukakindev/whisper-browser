const fs=require('fs'),path=require('path'),assert=require('assert/strict'),cp=require('child_process');
const {createBrowserAlignment}=require(path.resolve('src/browser-alignment'));
const wait=ms=>new Promise(r=>setTimeout(r,ms));let proc,closed=false,temp;
const spawnImpl=(exe,args,opts)=>{
 if(exe!=='alignment-controlled-engine')return cp.spawn(exe,args,opts);
 temp=opts.env.WHISPER_ALIGN_TMPDIR;
 const code=`const cp=require('child_process'),fs=require('fs'),path=require('path');const c=cp.spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{windowsHide:true,stdio:['ignore','inherit','inherit']});fs.writeFileSync(path.join(process.env.WHISPER_ALIGN_TMPDIR,'children.json'),JSON.stringify({parent:process.pid,child:c.pid}));setInterval(()=>{},1000);`;
 proc=cp.spawn(process.execPath,['-e',code],opts);proc.once('close',()=>closed=true);return proc;
};
(async()=>{
 const controller=new AbortController(),cues=[0,1,2].map(i=>({start:i*3,end:i*3+1,text:'Synthetic '+i}));
 const outcome=createBrowserAlignment({pythonPath:'alignment-controlled-engine',spawnImpl}).align({referenceCues:cues,targetCues:cues},{signal:controller.signal}).then(value=>({value}),error=>({error:error.message,closedAtTerminal:closed}));
 const deadline=Date.now()+10000;while(!temp||!fs.existsSync(path.join(temp,'children.json'))){if(Date.now()>deadline)throw Error('Child fixture startup timeout');await wait(30);}
 const ids=JSON.parse(fs.readFileSync(path.join(temp,'children.json'),'utf8'));const started=Date.now();controller.abort();const result=await outcome;
 assert(result.error&&result.closedAtTerminal);assert.equal(fs.existsSync(temp),false);
 for(const pid of [ids.parent,ids.child]){let alive=true;for(let i=0;i<20;i++){try{process.kill(pid,0);}catch{alive=false;break;}await wait(30);}assert(!alive,'Owned process remains: '+pid);}
 const report={ok:true,milliseconds:Date.now()-started,closedAtTerminal:true,parentAndChildExited:true,tempRemoved:true,osCloseCode:proc.exitCode,error:result.error};fs.writeFileSync('tmp/r780/result.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
})().catch(e=>{console.error(e.stack);if(proc&&!closed)cp.spawn('taskkill',['/pid',String(proc.pid),'/T','/F'],{windowsHide:true});process.exitCode=1});
