'use strict';

// Main-process generated page tools use the same trusted palette as renderer CSS.
// No site-supplied colour or executable CSS is accepted here.
const css=require('node:fs').readFileSync(require('node:path').join(__dirname,'renderer/theme-palette.css'),'utf8');
function palette(theme='dark') {
  const base=/:root\s*\{([^}]+)\}/.exec(css)?.[1]||'';
  const light=/html\[data-theme="light"\]\s*\{([^}]+)\}/.exec(css)?.[1]||'';
  const read=body=>Object.fromEntries([...body.matchAll(/--theme-([\w-]+)\s*:\s*(#[\da-f]{6})\s*;/gi)].map(m=>[m[1],m[2]]));
  const result={...read(base),...(theme==='light'?read(light):{})};
  for(const key of ['accent','accent-hover','accent-contrast'])if(!result[key])throw Error('Canonical theme palette is incomplete.');
  return result;
}
module.exports={palette};
