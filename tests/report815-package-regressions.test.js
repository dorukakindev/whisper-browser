'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm'),{pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'..'),manifest=require('../tools/package-manifest');
test('B104/B105: actual packager copy excludes private markers and the installer lock is restored and required',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'r815-package-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const source=path.join(dir,'source'),target=path.join(dir,'output'),app=path.join(target,'resources','app');
 const write=(rel,body)=>{const dest=path.join(source,rel);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,body);};
 for(const rel of manifest.requiredPackageFiles(root))write(rel,'/* fixture */');
 const inputs=['.gitignore','package.json','package-lock.json','install.bat','tools/install-orchestrator.js','backend/requirements-core.lock','backend/constraints-install.lock','backend/requirements-whisperx.lock','backend/requirements-diarize.lock'];for(const rel of inputs)write(rel,fs.readFileSync(path.join(root,rel)));
 const privateFiles=['.env','.env.local','tmp/profile/settings.json','.tmp/profile/settings.json','logs/session.log','fixture-audio.wav','fixture-video.mp4'];for(const rel of privateFiles)write(rel,'SYNTHETIC PRIVATE MARKER');
 const filterPath=path.join(path.dirname(require.resolve('@electron/packager')),'copy-filter.js');const {populateIgnoredPaths,userPathFilter}=await import(pathToFileURL(filterPath).href);const options={dir:source,out:target,name:'Fixture',platform:'win32',arch:'x64',prune:true,ignore:manifest.PACKAGER_IGNORE};options.ignore=populateIgnoredPaths(options).ignore;await fs.promises.cp(source,app,{recursive:true,filter:userPathFilter(options)});
 assert.deepEqual(privateFiles.filter(rel=>fs.existsSync(path.join(app,rel))),[]);assert(manifest.missingInTarget(target,source).includes('package-lock.json'));
 const copyLock=fs.readFileSync(path.join(root,'tools/package-windows.js'),'utf8').split(/\r?\n/).find(line=>line.includes('fs.copyFileSync(')&&line.includes('package-lock.json'));assert(copyLock);vm.runInNewContext(copyLock,{fs,path,root:source,target});assert(fs.existsSync(path.join(app,'package-lock.json')));assert.deepEqual(manifest.missingInTarget(target,source),[]);
 const {InstallOrchestrator}=require('../tools/install-orchestrator');new InstallOrchestrator(app,{log(){},commandExists:()=>true,nodeVersion:()=> 'v22.13.0',systemPythonVersion:()=>({major:3,minor:11,patch:9}),localFfmpegExists:()=>true,freeBytes:()=>20*1024**3}).preflight();
 fs.unlinkSync(path.join(app,'package-lock.json'));assert(manifest.missingInTarget(target,source).includes('package-lock.json'));
});
