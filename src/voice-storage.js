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
  const marker = path.join(dirs.root, '.legacy-migration-v1.json');
  let completed = [];
  try { const data = JSON.parse(await fs.promises.readFile(marker, 'utf8')); if (Array.isArray(data.completed)) completed = data.completed; } catch (_) {}
  for (const [oldName, target] of [['Referans sesler', dirs.references], ['dub-output', dirs.output], ['dub-background-cache', path.join(dirs.input, 'Arka plan')]]) {
    const source = path.join(legacy, oldName);
    if (completed.includes(oldName)) continue;
    if (!fs.existsSync(source)) continue;
    await fs.promises.cp(source, target, { recursive: true, force: false, filter: async file => !(await fs.promises.lstat(file)).isSymbolicLink() });
    completed.push(oldName);
    const temporary = `${marker}.${process.pid}.tmp`;
    await fs.promises.writeFile(temporary, JSON.stringify({ completed }), 'utf8');
    await fs.promises.rename(temporary, marker);
  }
  return dirs;
}
module.exports = { voiceStorage, prepareVoiceStorage };
