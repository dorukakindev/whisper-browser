#!/usr/bin/env node
'use strict';
// Optional stdio MCP adapter. This token is for the local bridge, not a model API.
const readline=require('node:readline');
const port=Number(process.env.WHISPER_MCP_PORT),token=process.env.WHISPER_MCP_TOKEN;
if(!Number.isInteger(port)||port<1024||port>65535||typeof token!=='string'||token.length<32){console.error('Configure WHISPER_MCP_PORT and a separate WHISPER_MCP_TOKEN for the app and this adapter.');process.exitCode=1;}
else{
 let queued=Promise.resolve();const input=readline.createInterface({input:process.stdin,crlfDelay:Infinity});
 input.on('line',line=>{queued=queued.then(async()=>{let request;try{if(Buffer.byteLength(line)>65536)throw Error('Request too large.');request=JSON.parse(line);const response=await fetch('http://127.0.0.1:'+port+'/rpc',{method:'POST',redirect:'error',signal:AbortSignal.timeout(12000),headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:line});if(!response.ok)throw Error('Local MCP bridge unavailable: HTTP '+response.status);if(request.id!==undefined)process.stdout.write(JSON.stringify(await response.json())+'\n');}catch(error){if(request?.id!==undefined)process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:request.id,error:{code:-32603,message:String(error.message).slice(0,200)}})+'\n');else console.error('Invalid or unavailable local MCP request.');}});});
}
