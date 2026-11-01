'use strict';
const auditOut=require('node:path').resolve(__dirname,'../../../../.tmp/audit837-replay/dub');require('node:fs').mkdirSync(auditOut,{recursive:true});
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../../../..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const files=['src/dub-workspace.js','src/renderer/dub-workspace-model.js','src/renderer/dub-workspace-ui.js','src/renderer/index.html','backend/dub_export.py','tools/voxcpm2/dub_normalize.py','tools/voxcpm2/measure_background.py'];
const Model=require(path.join(root,'src/renderer/dub-workspace-model'));
const mixed=Model.mix({voice:.8,music:.6,duckAmount:.2});assert.equal(mixed.voice,.8);assert.equal(mixed.duck,true);
const html=read('src/renderer/index.html'),optionBlock=html.match(/<select id="dubExportKind">([\s\S]*?)<\/select>/)[1];
const exportKinds=[...optionBlock.matchAll(/value="([^"]+)"/g)].map(m=>m[1]);assert.deepEqual(exportKinds,['audio','video','dual']);
const py=String.raw`import sys, json, importlib.util, os
from pathlib import Path
root=Path(sys.argv[1]); out=Path(sys.argv[2]); os.chdir(out)
spec=importlib.util.spec_from_file_location('dub_export',root/'backend/dub_export.py'); d=importlib.util.module_from_spec(spec);spec.loader.exec_module(d)
d.probe=lambda ffmpeg,file: {'format':{'duration':'12'},'streams':[{'codec_type':'video'},{'codec_type':'audio'}]}
commands=[];d.run=lambda command: commands.append(command)
request={'voice':'fixture-voice.wav','video':'fixture-video.mkv','kind':'dual','sync':None,'mix':{'voice':1,'background':.75,'music':.75,'ambience':.75,'duck':True,'duckAmount':.35},'rows':[],'background':'fixture-background.wav','music':'fixture-music.wav','ambience':'fixture-ambience.wav'}
d.export(request,'fixture-output.mp4','ffmpeg')
print(json.dumps({'command':commands[0],'graph':Path('filters.txt').read_text(),'map_time_control':d.map_time({'segments':[{'v0':1,'v1':3,'a0':1,'a1':5}]},4)}))`;
const fixture=path.join(auditOut,'output.tmp');fs.mkdirSync(fixture,{recursive:true});
fs.writeFileSync(path.join(auditOut,'export-probe.py'),py);
const cached=path.join(auditOut,'graph-result.json');
const child=fs.existsSync(cached)?null:cp.spawnSync(path.join(root,'backend/venv/Scripts/python.exe'),['-B','-c',py,root,fixture],{encoding:'utf8'});
if(child?.error){console.log('Python child launch unavailable. Run export-probe.py ROOT OUTPUT_TMP > graph-result.json, then rerun this probe.');process.exit(2);}
if(child)assert.equal(child.status,0,child.stderr);const graph=JSON.parse(child?child.stdout:fs.readFileSync(cached,'utf8').replace(/^\uFEFF/,''));
assert(graph.command.includes('[mix]'));assert(graph.command.includes('[original]'));assert(graph.graph.includes('amix=inputs=4'));assert(!graph.command.includes('-c:s'));assert.deepEqual(graph.map_time_control,[6,1]);
const registry=JSON.parse(read('docs/audits/deepseek-night1000-20261027/COVERAGE-REGISTRY.json'));
const families=['F21','F22','F23','F24','F25','F26','F27','F28','F32','F44'];
const scenarios=registry.scenarios.filter(row=>families.includes(row.family));
const reports=[815,...Array.from({length:19},(_,i)=>818+i)].map(n=>({number:n,text:read('docs/raporlar/BROWSER_BUG_REPORT_'+n+'.md')}));
const search=['LUFS','stem','katman','fade','HDR','mix','karışım','altyazı','dinledim','onay'];
const reviewed={registryRun:registry.run_id,scenarioCount:scenarios.length,scenarios,reports:reports.map(r=>({number:r.number,sha256:crypto.createHash('sha256').update(r.text).digest('hex'),matches:r.text.split(/\r?\n/).filter(l=>search.some(t=>l.toLowerCase().includes(t.toLowerCase()))).filter(l=>/^#|^\|.*G\d/.test(l)).slice(0,65)})),excluded:['R835-06 missing passage','R835-07 projection metadata','R833 rollback/waveform','R815-G21 audio-track snapshot','R587 manual approval','R835-G13..18 six dub suggestions']};
fs.writeFileSync(path.join(auditOut,'registry-reviewed.json'),JSON.stringify(reviewed,null,2));
const result={head:'9b3f9e462abaebfd1e3a321fcb72e9594b8c7533',bugCount:0,suggestionCount:8,scope:'Read-only source audit; controlled export graph, no real media/model/FFmpeg/UI execution',existing:{exportKinds,mix:mixed,graph},sources:files.map(file=>({file,sha256:crypto.createHash('sha256').update(read(file)).digest('hex')})),controls:['Current three export modes retained','Actual exporter builds mixed plus original audio tracks','Actual map_time shifts 4 seconds to 6 for +2 extension','Current mix helper validates/defaults settings']};
fs.writeFileSync(path.join(auditOut,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({bugCount:0,suggestionCount:8,exportKinds,registryScenariosReviewed:scenarios.length,controls:result.controls.length}));
