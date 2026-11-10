'use strict';
const path=require('node:path'),fs=require('node:fs'),C=require('../src/personal-collection');
const [root]=process.argv.slice(2);if(!root||!path.isAbsolute(root))throw Error('Choose an absolute profile path.');
const file=path.join(root,'personal-collection.json');if(fs.existsSync(file))fs.copyFileSync(file,file+'.before-metadata-'+Date.now()+'.bak',fs.constants.COPYFILE_EXCL);
const service=require('../src/collection-metadata').create({root});service.start({limit:400});let last='';const timer=setInterval(()=>{const state=service.snapshot(),line=JSON.stringify(state);if(line!==last){console.log(line);last=line;}},4000);
(async()=>{try{await service.wait();console.log(JSON.stringify({metadata:service.snapshot(),anime:await service.candidates({domain:'anime'})}));}catch(e){console.error(e.message);process.exitCode=1;}finally{clearInterval(timer);}})();
