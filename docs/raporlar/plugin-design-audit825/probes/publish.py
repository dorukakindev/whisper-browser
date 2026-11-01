from pathlib import Path
import json, shutil, hashlib, subprocess
root=Path.cwd(); dest=root/'docs/raporlar/plugin-design-audit825'; assets=dest/'assets'; proof=dest/'probes'
assets.mkdir(parents=True,exist_ok=True);proof.mkdir(exist_ok=True)
sources={
'settings':root/'.uiprev/settings-design-tour/after-1793507406538-34532',
'assistant':root/'.uiprev/assistant-design-tour/1793507596013-after',
'film':root/'tmp/design824-fixes-film/1793507589006',
'dub':root/'.uiprev/dub-natural-1793507588939',
'reader':root/'.uiprev/pdf-reader678-1793507925429',
'keyboard':root/'.uiprev/keyboard825-1793507827981',
'modal':root/'.uiprev/modal825-1793507747105',
}
selected={
'settings':['1440-tr-ai.png','520-tr-ai.png','1440-tr-general.png','result.json'],
'assistant':['360-en-light-streaming.png','480-tr-dark-long-code.png','360-en-light-conversation-menu.png','busy-native-keyboard.json','measurements.json','result.json'],
'film':['film-sample-1440-tr-dark.png','film-editor-800-en-light.png','film-metrics.json'],
'dub':['tr-1440-ready.png','en-640-review.png','acceptance.json'],
'reader':['reading-en-light.png','voice-range.png','text-reader-narrow.png','results.json'],
'keyboard':['native-keys.json'],
'modal':['geometry.json'],
}
for name,src in sources.items():
 for file in set(selected[name]+[p.name for p in src.glob('*-audit.json')]):
  p=src/file;target=assets/(name+'-'+file)
  if p.suffix=='.json':
   text=p.read_text(encoding='utf-8').replace(str(root),'REPO').replace(str(root).replace('\\','/'),'REPO').replace(str(root).replace('\\','\\\\'),'REPO')
   json.loads(text);target.write_text(text,encoding='utf-8',newline='\n')
  else:shutil.copyfile(p,target)
for p in (root/'tmp/audit825').glob('*.cjs'):(proof/p.name).write_text(p.read_text(encoding='utf-8').rstrip()+'\n',encoding='utf-8',newline='\n')
shutil.copyfile(__file__,proof/'publish.py')
snapshot={'base':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),'productChanged':False,'providerCalls':0,'capture':'Native Windows Electron 43.5.0, synthetic isolated profiles, GPU disabled; not IAB/Product Design full runtime','runs':{k:str(v.relative_to(root)).replace('\\','/') for k,v in sources.items()},'plugins':{'redesign':'2.0.0 diagnosis checklist used; implementation stage intentionally not requested','designly':'4.4.0 visual-qa and slop taxonomy used','product-design':'0.1.56 audit framework/preflight read; native Electron adaptation, not full IAB workflow','motion-design':'2.0.0 inspected; mandatory GSAP/AIDA generation does not fit current audit; not executed','superdesign':'0.6.0 inspected; canvas generation/CLI session not started','design-arc':'1.5.5 inspected; no setup/preference/home workflow started','horizonx':'current local package missing; no MCP tool exposed; not executed','themely':'1.0.0 metadata only; no skill or invocation tool exposed; not executed','frontend-design-premium':'previous R824 ownership/verification contract retained; no new strict audit run','impeccable':'previous R824 craft/consistency context retained; no new static scan run'},'discarded':['assistant axe scrollable-region-focusable contradicted by native Tab and arrows','PDF contrast warnings measured mid-theme-transition disappear after stable-frame sampling','backdrop wheel did not move root under native settings modal'],'confirmed':[{'id':'D825-01','severity':'LOW','type':'semantics','selector':'.mh-brand','rule':'aria-prohibited-attr','source':'src/renderer/media-home.js:404'}],'improvements':['U825-01','U825-02','U825-03','U825-04','U825-05'],'limits':['No live provider/Luna screenshots/GPU/DRM/start.bat/full npm test','No screen reader speech or FPS/drop-frame claims','No paid generation, new dependencies or product edits']}
(dest/'SNAPSHOT.json').write_text(json.dumps(snapshot,ensure_ascii=False,indent=2),encoding='utf-8',newline='\n')
files={str(p.relative_to(dest)).replace('\\','/'):hashlib.sha256(p.read_bytes().replace(b'\r\n',b'\n') if p.suffix in ['.json','.md','.cjs','.py'] else p.read_bytes()).hexdigest() for p in dest.rglob('*') if p.is_file() and p.name!='MANIFEST.json'}
(dest/'MANIFEST.json').write_text(json.dumps({'normalization':'Text LF; binary exact','sha256':files},indent=2),encoding='utf-8',newline='\n')
print(json.dumps({'files':len(files),'screenshots':len(list(assets.glob('*.png'))),'bytes':sum(p.stat().st_size for p in dest.rglob('*') if p.is_file())}))
