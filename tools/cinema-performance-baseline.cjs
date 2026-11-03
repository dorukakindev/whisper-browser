'use strict';
// Prepare a read-only historical renderer for the native performance fixture.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),url=require('node:url'),crypto=require('node:crypto');
const revision=process.argv[2]||'922f5474c517e15d9fb060633605dd0267d62f86';if(!/^[a-f0-9]{40}$/.test(revision))throw Error('Pass a full commit SHA');
const root=path.resolve(__dirname,'..'),out=path.join(root,'tmp/round5-baseline-runtime'),files=['cinema-motion.js','cinema-motion.css','film-watch-ui.js','media-daily-ui.js','film-page-enhancements.js'];
fs.mkdirSync(out,{recursive:true});const read=file=>cp.execFileSync('git',['show',revision+':src/renderer/'+file],{cwd:root}),manifest={revision,files:{}};
for(const file of files){const data=read(file);fs.writeFileSync(path.join(out,file),data);manifest.files[file]=crypto.createHash('sha256').update(data).digest('hex');}
let html=read('index.html').toString('utf8');const rendererBase=url.pathToFileURL(path.join(root,'src/renderer/')).href;
html=html.replace(/\b(src|href)="([^"\n]+)"/g,(full,attr,value)=>{if(/^(?:[a-z][\w+.-]*:|#|\/)/i.test(value))return full;const file=path.basename(value),target=files.includes(file)?url.pathToFileURL(path.join(out,file)).href:new URL(value,rendererBase).href;return attr+'="'+target+'"';});
fs.writeFileSync(path.join(out,'index.html'),html);fs.writeFileSync(path.join(out,'SNAPSHOT.json'),JSON.stringify(manifest,null,2));console.log(JSON.stringify({out,revision,files:files.length}));
