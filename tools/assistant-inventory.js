'use strict';
// Read-only inventory of literal IPC registrations, preload calls and HTML controls.
// This is a source index, not permission to expose every IPC channel to a model.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),rows=[];
function scan(file,regex,type){const text=fs.readFileSync(path.join(root,file),'utf8');for(const match of text.matchAll(regex))rows.push({type,name:match[1],file,line:1+text.slice(0,match.index).split('\n').length-1});}
for(const name of fs.readdirSync(path.join(root,'src')).filter(name=>name.endsWith('.js')).sort()){
 const file='src/'+name;
 scan(file,/ipcMain\.handle\(\s*['"]([^'"]+)['"]/g,'main.handle');scan(file,/ipcMain\.on\(\s*['"]([^'"]+)['"]/g,'main.on');
 if(/(?:^|-)preload\.js$/.test(name))for(const kind of ['invoke','send','sendSync','on'])scan(file,new RegExp('ipcRenderer\\.'+kind+'\\(\\s*[\'"]([^\'"]+)[\'"]','g'),'preload.'+kind);
}
for(const name of fs.readdirSync(path.join(root,'src/renderer')).filter(name=>name.endsWith('.html')).sort())scan('src/renderer/'+name,/<(?:input|select|textarea|button|details)\b[^>]*\bid=["']([^"']+)["']/g,'ui.control');
console.log(JSON.stringify({scope:'Literal source references only. Dynamic actions, runtime visibility and complete argument schemas require separate review. Credentials and setting values are not collected.',counts:rows.reduce((out,row)=>(out[row.type]=(out[row.type]||0)+1,out),{}),rows},null,2));
