const path = require('node:path');

function createBrowserMiniPlayer({ BrowserWindow, ipcMain, owner, restore, command }) {
  let window = null, tab = null;
  function layout() {
    if (!window || window.isDestroyed() || !tab?.view || tab.view.webContents.isDestroyed()) return false;
    const [width, height] = window.getContentSize();
    tab.view.setBounds({ x: 0, y: 0, width, height: Math.max(1, height - 48) });
    tab.view.setVisible(true);
    return true;
  }
  function close() { if (window && !window.isDestroyed()) window.close(); }
  ipcMain.handle('browser:mini:command', async (event, action) => {
    if (!window || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) return { ok: false };
    if (action === 'return') { close(); return { ok: true }; }
    if (!['play-pause', 'back', 'forward'].includes(action)) return { ok: false };
    return command(tab, action === 'back' || action === 'forward' ? 'seek-relative' : action,
      action === 'back' ? -10 : action === 'forward' ? 10 : undefined);
  });
  return {
    close, layout,
    owns: target => !!window && !window.isDestroyed() && target === tab,
    open(target) {
      if (!target?.view || target.view.webContents.isDestroyed()) return { ok: false, error: 'Önce bir video sayfası açın.' };
      if (window && tab === target && !window.isDestroyed()) { window.focus(); return { ok: true }; }
      const main = owner();
      if (!main || main.isDestroyed()) return { ok: false, error: 'Ana pencere kullanılamıyor.' };
      close();
      tab = target;
      window = new BrowserWindow({ width: 720, height: 480, minWidth: 360, minHeight: 260,
        title: 'Küçük oynatıcı · Whisper', alwaysOnTop: true, autoHideMenuBar: true,
        backgroundColor: '#181a1d', webPreferences: { preload: path.join(__dirname, 'browser-mini-preload.js'),
          contextIsolation: true, nodeIntegration: false, sandbox: true } });
      const currentWindow = window, currentTab = tab;
      try { main.contentView.removeChildView(currentTab.view); }
      catch (_) { currentWindow.close(); return { ok: false, error: 'Video görünümü taşınamadı.' }; }
      window.contentView.addChildView(currentTab.view);
      window.on('resize', layout);
      window.on('close', () => {
        if (window !== currentWindow) return;
        try { currentWindow.contentView.removeChildView(currentTab.view); } catch (_) {}
        window = null; tab = null;
        if (currentTab.view && !currentTab.view.webContents.isDestroyed() && !currentTab.closing) {
          const main = owner();
          // Kapanan ana pencerede addChildView native tarafta fırlayabilir.
          if (main && !main.isDestroyed()) {
            try { main.contentView.addChildView(currentTab.view); restore(); } catch (_) {}
          }
        }
      });
      window.loadFile(path.join(__dirname, 'renderer', 'browser-mini.html'));
      layout(); return { ok: true };
    },
  };
}
module.exports = { createBrowserMiniPlayer };
