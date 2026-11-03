'use strict';
// Reuse the isolated real main/preload/renderer bootstrap and controlled data.
const fs=require('node:fs'),Module=require('node:module');
let source=fs.readFileSync(require.resolve('./electron-cinema-design.smoke.js'),'utf8');
source=source.replace("'disable-gpu',",'').replace("'tmp/cinema-native-'","'tmp/cinema-round3-'").replace('65000','120000');
if(process.argv.includes('--no-tmdb'))source=source.replace("apiKey:'a'.repeat(32)","apiKey:''");
source=source.replace("await run('await initialSettingsReady;UiLocale.set(\"tr\",false);applyUiTheme(\"dark\");return true');", "await run('await initialSettingsReady;UiLocale.set(\"tr\",false);applyUiTheme(\"dark\");document.getElementById(\"uiMotion\").value=\"full\";document.getElementById(\"uiMotion\").dispatchEvent(new Event(\"change\"));return true');");
// Presentation settle is separate from timed transition captures.
source=source.replace('await pause(230);fs.writeFileSync','await pause(1050);fs.writeFileSync');
source=source.replace("await shot('film-bottom-'+width,'.cn-audience');", "await shot('film-bottom-'+width,'.cn-audience');await run('const p=document.querySelector(\".cn-film-page\");const d=p.querySelector(\".cn-film-tools\").closest(\"details\");d.open=true;d.scrollIntoView({block:\"start\"});return true');await shot('film-tools-'+width);await run('document.querySelector(\".cn-film-page .cn-film-tools\").closest(\"details\").open=false;return true');");
const seam=" assert(checks.every(r=>!r.overflow),'film no overflow');";
if(!source.includes(seam))throw Error('Native fixture seam changed');
const frames=String.raw`
 if(!process.argv.includes('--no-tmdb')){
  win.setContentSize(1440,1080);win.show();win.focus();await run('await MediaHomeUI.navigate("home");document.getElementById("mediaHome").scrollTop=0;return true');await pause(700);
  async function sequence(label,action){await action();let elapsed=0;for(const at of [0,200,600,900]){await pause(Math.max(0,at-elapsed));elapsed=at;fs.writeFileSync(path.join(out,label+'-'+at+'.png'),(await win.webContents.capturePage()).toPNG());shots.push(label+'-'+at);}}
  await sequence('frame-hero',()=>run('document.querySelector(".cn-carousel-dots button:nth-child(2)").click();return true'));
  const box=await run('const b=document.querySelector(".cn-poster-art").getBoundingClientRect();return{x:Math.round(b.x+b.width/2),y:Math.round(b.y+70)}');
  await sequence('frame-hover',async()=>{win.webContents.sendInputEvent({type:'mouseMove',...box});});
  await run('await MediaHomeUI.navigate("discover");document.getElementById("mediaHome").scrollTop=0;return true');await until(()=>run('return !!document.querySelector("[data-discovery-id]")'),'discovery transition origin');
  await sequence('frame-page',()=>run('const card=document.querySelector("[data-discovery-id]");card.focus();card.click();return true'));await pause(500);
  await sequence('frame-accordion',()=>run('const d=document.querySelector(".cn-film-page .cn-film-tools").closest("details");d.open=false;d.querySelector("summary").click();d.scrollIntoView({block:"center",behavior:"instant"});return true'));
 }
`;
source=source.replace(seam,frames+seam);
const compiled=new Module(__filename,module);compiled.filename=__filename;compiled.paths=module.paths;compiled._compile(source,__filename);
