'use strict';

// Windows uygulama manifestine <ws2:longPathAware> ekler.
// Electron'un gömülü varsayılan manifesti bu öğeyi içermez; registry'de
// LongPathsEnabled açık olsa bile manifest olmadan >260 karakterlik yollar
// (ör. D:\Whisper Local\...\derin-medya-klasörleri) Win32 MAX_PATH'e takılır.
// Paketleme sonrası exe'nin RT_MANIFEST (type 24) kaynağı yamalanır.

const LONG_PATH_ELEMENT = '<longPathAware xmlns="http://schemas.microsoft.com/SMI/2016/WindowsSettings">true</longPathAware>';
const ASM_V3_APPLICATION_OPEN = '<application xmlns="urn:schemas-microsoft-com:asm.v3">';
const WS2_LONG_PATH = '<ws2:longPathAware>true</ws2:longPathAware>';

/**
 * Manifest XML'ine longPathAware bildirimini ekler (idempotent).
 * @param {string} xml
 * @returns {string}
 */
function mergeLongPathAware(xml) {
  const text = String(xml || '');
  if (/longPathAware/i.test(text)) return text;
  const appIdx = text.indexOf(ASM_V3_APPLICATION_OPEN);
  if (appIdx !== -1) {
    const appEnd = text.indexOf('</application>', appIdx);
    if (appEnd !== -1) {
      const block = text.slice(appIdx, appEnd);
      const wsOpen = block.indexOf('<windowsSettings>');
      if (wsOpen !== -1) {
        const wsClose = block.indexOf('</windowsSettings>', wsOpen);
        if (wsClose !== -1) {
          // ws2 sözdizimi aynı WindowsSettings bloğuna eklenir.
          return `${text.slice(0, appIdx + wsClose)}${WS2_LONG_PATH}${text.slice(appIdx + wsClose)}`;
        }
      }
      // <windowsSettings> yok: application bloğuna komple ekle.
      return `${text.slice(0, appEnd)}<windowsSettings>${LONG_PATH_ELEMENT}</windowsSettings>${text.slice(appEnd)}`;
    }
  }
  // asm.v3 application bloğu yok: </assembly> öncesi komple ekle.
  const assemblyEnd = text.indexOf('</assembly>');
  if (assemblyEnd === -1) return text;
  return `${text.slice(0, assemblyEnd)}${ASM_V3_APPLICATION_OPEN}<windowsSettings>${LONG_PATH_ELEMENT}</windowsSettings></application>${text.slice(assemblyEnd)}`;
}

const RT_MANIFEST = 24;

/**
 * Paketlenmiş Windows exe'sinin RT_MANIFEST kaynağına longPathAware ekler.
 * @param {string} exePath
 * @param {{loadModule?: () => Promise<object>, readFile?: (p:string)=>Buffer, writeFile?: (p:string, b:Buffer)=>void}} io
 * @returns {Promise<{patched: boolean, reason?: string}>}
 */
async function patchExeManifest(exePath, io = {}) {
  const fs = require('node:fs');
  const loadModule = io.loadModule || (() => require('resedit/cjs').load());
  const readFile = io.readFile || ((p) => fs.readFileSync(p));
  const writeFile = io.writeFile || ((p, b) => fs.writeFileSync(p, b));
  const resedit = await loadModule();
  const exe = resedit.NtExecutable.from(readFile(exePath), { ignoreCert: true });
  const resource = resedit.NtExecutableResource.from(exe);
  const entry = resource.entries.find((item) => item.type === RT_MANIFEST);
  if (!entry) return { patched: false, reason: 'RT_MANIFEST kaynağı bulunamadı.' };
  const before = Buffer.from(entry.bin).toString('utf8');
  const after = mergeLongPathAware(before);
  if (after === before) {
    return /longPathAware/i.test(before)
      ? { patched: false, reason: 'longPathAware zaten tanımlı.' }
      : { patched: false, reason: 'manifest XML beklenmeyen biçimde; </assembly> bulunamadı.' };
  }
  entry.bin = Buffer.from(after, 'utf8');
  resource.outputResource(exe);
  writeFile(exePath, exe.generate());
  return { patched: true };
}

module.exports = { LONG_PATH_ELEMENT, RT_MANIFEST, mergeLongPathAware, patchExeManifest };
