'use strict';
const fs=require('node:fs'),path=require('node:path');
const axe=fs.readFileSync(require.resolve('axe-core'),'utf8');
module.exports=async function inspect(win,out,label){
 await win.webContents.executeJavaScript(axe);
 const data=await win.webContents.executeJavaScript(`(async()=>{
  const result=await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa']}});
  const animations=document.getAnimations().map(a=>({target:a.effect?.target?.id||a.effect?.target?.className?.baseVal||String(a.effect?.target?.className||''),state:a.playState,timing:a.effect?.getTiming()}));
  const visible=n=>{const r=n.getBoundingClientRect(),s=getComputedStyle(n);return r.width>0&&r.height>0&&r.bottom>0&&r.top<innerHeight&&r.right>0&&r.left<innerWidth&&s.visibility!=='hidden'&&s.display!=='none'};
  const controls=[...document.querySelectorAll('button,summary,input,select,textarea,a[href]')].filter(visible).map(n=>{const r=n.getBoundingClientRect();return {id:n.id,tag:n.tagName,text:(n.getAttribute('aria-label')||n.textContent||n.getAttribute('placeholder')||'').trim().slice(0,90),rect:r.toJSON(),font:getComputedStyle(n).fontSize,disabled:!!n.disabled}});
  return {viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},reduce:matchMedia('(prefers-reduced-motion:reduce)').matches,animations,controls,violations:result.violations,incomplete:result.incomplete.map(v=>({id:v.id,nodes:v.nodes.length})),passes:result.passes.map(v=>v.id)};
 })()`);
 fs.writeFileSync(path.join(out,label+'-audit.json'),JSON.stringify(data,null,2));
};
