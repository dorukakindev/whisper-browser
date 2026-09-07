const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const main = fs.readFileSync(path.join(root, 'src', 'main.js'), 'utf8');
const preload = fs.readFileSync(path.join(root, 'src', 'preload.js'), 'utf8');
const renderer = fs.readFileSync(path.join(root, 'src', 'renderer', 'renderer.js'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'src', 'renderer', 'styles.css'), 'utf8');

function section(source, start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  assert(from >= 0 && to > from, `Bölüm bulunamadı: ${start}`);
  return source.slice(from, to);
}

{
  const body = section(main, "ipcMain.handle('maintenance:updateYtdlp'", "ipcMain.handle('transcribe:cancel'");
  assert.match(body, /let timedOut\s*=\s*false/);
  assert.match(body, /let timeoutTimer\s*=\s*null/);
}

{
  const body = section(preload, 'onWatchFiles:', 'onMediaEvent:');
  assert.match(body, /const listener/);
  assert.match(body, /return \(\) => ipcRenderer\.removeListener\('watch:newFiles', listener\)/);
}

{
  const body = section(renderer, 'function updateBrowserNavigation(', 'function browserSponsorMode(');
  assert.match(body, /const expectedTabId\s*=\s*player\.browserActiveTabId/);
  assert.match(body, /player\.browserActiveTabId\s*!==\s*expectedTabId/);
  assert.match(body, /browserTabState\(expectedTabId\)\?\.generation\s*!==\s*expectedGeneration/);
}

{
  const workspace = section(renderer, 'function setWorkspaceMode(', 'async function navigateBrowserFromAddress');
  assert.match(workspace, /disconnectBrowserBoundsObserver\(\)/);
  assert.match(workspace, /bindBrowserBoundsObserver\(\)/);
  const close = section(renderer, 'function closePlayer()', 'function setShortcutHelpOpen(');
  assert.match(close, /disconnectBrowserBoundsObserver\(\)/);
}

{
  const loop = section(renderer, "// A-B dongusu: B'ye gelince A'ya don", '// Yukleniyor halkasi:');
  assert.match(loop, /video\.currentTime\s*=\s*player\.abA;\s*renderCue\(\)/s);
}

{
  const quit = section(main, "app.on('before-quit'", "app.on('window-all-closed'");
  assert.match(quit, /clearInterval\(watchTimer\)/);
  assert.match(quit, /watchTimer\s*=\s*null/);
}

{
  const video = section(renderer, "video.addEventListener('error'", "$('playPause').addEventListener");
  assert.match(video, /video\.error\?\.code/);
  assert.match(video, /MEDIA_ERR_(?:ABORTED|NETWORK|DECODE|SRC_NOT_SUPPORTED)/);
}

assert.match(styles,
  /:where\([^)]*summary[^)]*\[contenteditable="true"\][^)]*\):focus-visible/);

console.log('deep-analysis-regressions: 8 test');
