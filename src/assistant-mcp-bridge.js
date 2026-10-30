'use strict';
const http=require('node:http'),{timingSafeEqual}=require('node:crypto');
const GUIDE={name:'search_app_guide',description:'Search application guidance. No personal settings are exposed.',inputSchema:{type:'object',properties:{query:{type:'string',maxLength:400}},required:['query'],additionalProperties:false}};
function createBridge({token,port,getJobs,getTabs}){
 if(typeof token!=='string'||token.length<32||!Number.isInteger(port)||port<1024||port>65535)throw Error('MCP requires an explicit port and a separate token of at least 32 characters.');
 const tools=[GUIDE,...['get_jobs','get_tabs'].map(name=>({name,description:'Read current application '+name.slice(4)+'.',inputSchema:{type:'object',properties:{},additionalProperties:false}}))];
 for(const tool of tools)tool.annotations={readOnlyHint:true,idempotentHint:true,openWorldHint:false};
 const allowed=Buffer.from('Bearer '+token);let server;
 async function rpc(packet){
  if(packet?.method==='initialize')return {protocolVersion:'2025-06-18',capabilities:{tools:{}},serverInfo:{name:'whisper-browser',version:'1.0.0'}};
  if(packet?.method==='ping')return {};
  if(packet?.method==='tools/list')return {tools};
  if(packet?.method==='tools/call'){
   const {name,arguments:args={}}=packet.params||{};if(!args||typeof args!=='object'||Array.isArray(args))throw Error('Invalid tool arguments.');let data;
   if(name==='search_app_guide'){if(Object.keys(args).some(k=>k!=='query')||typeof args.query!=='string'||!args.query.trim()||args.query.length>400)throw Error('Invalid guide query.');data=require('./assistant-guide').lookup(args.query);}
   else if(name==='get_jobs'||name==='get_tabs'){if(Object.keys(args).length)throw Error('Unexpected arguments.');data=name==='get_jobs'?getJobs():getTabs();}
   else throw Error('Only registered read-only tools are available.');
   return {content:[{type:'text',text:JSON.stringify(data)}]};
  }
  throw Error('Unknown MCP method.');
 }
 return {rpc,start:()=>new Promise((resolve,reject)=>{server=http.createServer(async(req,res)=>{
  const auth=Buffer.from(String(req.headers.authorization||''));if(req.method!=='POST'||req.url!=='/rpc'||req.headers.origin||auth.length!==allowed.length||!timingSafeEqual(auth,allowed)){res.writeHead(403);res.end();return;}
  let data='',packet;try{for await(const chunk of req){data+=chunk;if(Buffer.byteLength(data)>65536)throw Error('Request too large.');}packet=JSON.parse(data);if(!packet||packet.jsonrpc!=='2.0')throw Error('Invalid RPC.');if(packet.id===undefined){res.writeHead(204);res.end();return;}const result=await rpc(packet);res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({jsonrpc:'2.0',id:packet.id,result}));}
  catch(error){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({jsonrpc:'2.0',id:packet?.id??null,error:{code:-32602,message:String(error.message).slice(0,200)}}));}
 });server.requestTimeout=10000;server.on('error',reject);server.listen(port,'127.0.0.1',()=>resolve(server.address()));}),stop:()=>new Promise(resolve=>{if(!server)return resolve();server.closeAllConnections();server.close(resolve);})};
}
module.exports={createBridge};
