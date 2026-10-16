'use strict';
const fs = require('node:fs');
const path = require('node:path');
function voiceStorage(app) {
  const root = path.join(app.getPath('downloads'), 'Sesler');
  return { root, input: path.join(root, 'Girdi'), output: path.join(root, 'Çıktı'), references: path.join(root, 'Ses referansları') };
}
async function prepareVoiceStorage(app) {
  const dirs = voiceStorage(app);
  for (const dir of Object.values(dirs)) await fs.promises.mkdir(dir, { recursive: true });
  const legacy = app.getPath('userData');
  for (const [oldName, target] of [['Referans sesler', dirs.references], ['dub-output', dirs.output], ['dub-background-cache', path.join(dirs.input, 'Arka plan')]]) {
    const source = path.join(legacy, oldName);
    if (!fs.existsSync(source)) continue;
    await fs.promises.cp(source, target, { recursive: true, force: false, filter: async file => !(await fs.promises.lstat(file)).isSymbolicLink() });
  }
  return dirs;
}
module.exports = { voiceStorage, prepareVoiceStorage };
