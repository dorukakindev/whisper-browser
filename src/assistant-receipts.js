'use strict';
// Bounded, in-memory approval receipts. A receipt only replays or explains what already happened;
// it never authorizes a new action. Scope: sender window + proposal id + source owner.
// Lifetime: kept for `ttl` after the action settled (default 30 min), at most `max` settled entries
// (default 100, oldest first), running entries are never pruned, everything is dropped on quit.
// Nothing is written to disk and no source text, keys or paths are stored: only the bounded result
// the renderer already returned to the application.
function createReceipts({ttl=30*60*1000,max=100,now=Date.now}={}){
 const rows=new Map();
 function prune(){
  const time=now();
  for(const [id,row] of rows)if(row.state!=='applying'&&row.expires<=time)rows.delete(id);
  for(const [id,row] of rows){if(rows.size<=max)break;if(row.state!=='applying')rows.delete(id);}
 }
 return {
  claim(id,{sender,owner,name}){prune();rows.delete(id);rows.set(id,{sender,owner,name,state:'applying',expires:Infinity});},
  settle(id,patch){const row=rows.get(id);if(!row)return;Object.assign(row,patch,{expires:now()+ttl});prune();},
  drop(id){rows.delete(id);},
  get(id){prune();return rows.get(id)||null;},
  clear(){rows.clear();},
  get size(){return rows.size;}
 };
}
module.exports={createReceipts};
