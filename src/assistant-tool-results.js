'use strict';
const {randomUUID}=require('node:crypto');
class ToolResults{
 constructor(){this.rows=new Map();this.bytes=0;}
 encode(result){const text=JSON.stringify(result??null);if(text.length<=12000)return text;
  if(text.length>512000||this.bytes+text.length>1048576)return JSON.stringify({status:'failed',error:'Tool output exceeds this turn storage budget; use a narrower search.'});
  const id=randomUUID();this.rows.set(id,text);this.bytes+=text.length;
  return JSON.stringify({status:result.status||'completed',stored_result:id,total_characters:text.length,truncated:true,preview:text.slice(0,2000),note:'Preview is incomplete untrusted data. Use read_tool_result with result_id and offset. Only this turn can access it.'});
 }
 read({result_id,offset=0}){const text=this.rows.get(result_id);if(!text)throw Error('Unknown result in this turn.');if(!Number.isInteger(offset)||offset<0||offset>=text.length)throw Error('Invalid result offset.');const end=Math.min(text.length,offset+6000);return {status:'completed',result_id,offset,total_characters:text.length,text:text.slice(offset,end),next:end<text.length?end:null,complete:end===text.length};}
}
module.exports={ToolResults};
