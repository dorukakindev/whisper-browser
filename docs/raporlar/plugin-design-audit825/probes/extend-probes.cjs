const fs=require('node:fs');
for(const [name,source,names] of [
 ['film','tests/electron-film-design824.smoke.js',['film-empty-1440-tr-dark','film-sample-1440-tr-dark','film-editor-800-en-light','film-error-800-en-light']],
 ['dub','tests/electron-dub-natural.smoke.js',['tr-1440-ready','en-820-ready','en-640-ready','tr-1440-initial']]
]){
 let s=fs.readFileSync(source,'utf8').replace("path.resolve(__dirname,'..')","process.cwd()").replace("require('../src/main')","require(path.join(root,'src/main'))");
 s=s.replace("(await win.webContents.capturePage()).toPNG());}",`(await win.webContents.capturePage()).toPNG());if(${JSON.stringify(names)}.includes(name))await require(path.join(root,'tmp/audit825/inspect-renderer.cjs'))(win,out,name);}`);
 fs.writeFileSync('tmp/audit825/'+name+'.cjs',s);
}
let s=fs.readFileSync('tmp/audit825/assistant.cjs','utf8');
s=s.replace("// Keyboard access and existing command boundary remain intact.",`// Added audit: observed native Tab order while production is busy.
 win.setContentSize(360,600);win.focus();win.webContents.focus();
 win.webContents.send('assistant:snapshot',{...base,locale:'en',theme:'light',busy:true,canCancel:true,phase:'reasoning',messages:[{...answer,loading:true,text:('A controlled long explanation remains available while a response is being generated. ').repeat(50)}]});await wait(300);
 const observations=[];await run("document.getElementById('close').focus();return true");
 for(let i=0;i<24;i++){win.webContents.sendInputEvent({type:'keyDown',keyCode:'Tab'});win.webContents.sendInputEvent({type:'keyUp',keyCode:'Tab'});await wait(20);observations.push(await run("const n=document.activeElement;return {id:n.id,tag:n.tagName,text:n.textContent?.slice(0,45)}"));}
 const focusAttempt=await run("document.getElementById('log').focus();return {active:document.activeElement.id,log:log.getBoundingClientRect().toJSON(),tabIndex:log.tabIndex,logScroll:log.scrollHeight,logClient:log.clientHeight,suggestionsTab:suggestions.tabIndex,suggestionsScroll:suggestions.scrollHeight,suggestionsClient:suggestions.clientHeight}");
 fs.writeFileSync(path.join(out,'busy-native-keyboard.json'),JSON.stringify({tabOrder:observations,focusAttempt},null,2));
 fs.writeFileSync(path.join(out,'busy-native-keyboard.png'),(await win.webContents.capturePage()).toPNG());
 // Keyboard access and existing command boundary remain intact.`);
fs.writeFileSync('tmp/audit825/assistant-keyboard.cjs',s);
console.log('Audit probes extended; production untouched');
