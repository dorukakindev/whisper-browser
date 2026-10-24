// Remend 1.4.0: Apache-2.0; source and licenses in third_party/remend.
const path=require('node:path');
const fs=require('node:fs');
const root=path.resolve(__dirname,'..');
const entry=process.argv[2]?path.resolve(process.argv[2]):path.join(root,'node_modules/remend/dist/index.js');
const pkg=JSON.parse(fs.readFileSync(path.join(path.dirname(entry),'../package.json'),'utf8'));
if(pkg.name!=='remend'||pkg.version!=='1.4.0')throw Error('Expected remend 1.4.0');
require('esbuild').buildSync({entryPoints:[entry],outfile:path.join(root,'src/renderer/vendor/assistant-remend.js'),bundle:true,format:'iife',globalName:'AssistantRemend',platform:'browser',target:'chrome120',minify:true,banner:{js:'/*! Remend 1.4.0 (c) Vercel, Inc. Apache-2.0. See third_party/remend. */'}});
