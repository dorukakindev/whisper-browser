const fs=require('node:fs');let s=fs.readFileSync('tests/electron-pdf-reader-experience.smoke.js','utf8');
s=s.replace('path.resolve(__dirname, "..")','process.cwd()').replace('require("../src/media-workflows")','require(path.join(root,"src/media-workflows"))').replace('require("../src/main")','require(path.join(root,"src/main"))');
s=s.replace('await wait(350);',`await wait(350);
 if(['reading-tr-dark.png','voice-range.png','reading-en-light.png'].includes(name))await require(path.join(root,'tmp/audit825/inspect-renderer.cjs'))(win,out,name.replace('.png',''));`);
fs.writeFileSync('tmp/audit825/reader.cjs',s);
