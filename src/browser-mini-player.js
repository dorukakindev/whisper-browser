const path = require('node:path');
const { attachSubframeSchemeGuard } = require('./browser-navigation-policy');

function createBrowserMiniPlayer({ BrowserWindow, ipcMain, owner, restore, command, dialogText, hideOffscreen }) {
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
        title: (dialogText || ((tr) => tr))('Küçük oynatıcı · Whisper', 'Mini player · Whisper'), alwaysOnTop: true, autoHideMenuBar: true,
        backgroundColor: '#181a1d', webPreferences: { preload: path.join(__dirname, 'browser-mini-preload.js'),
          contextIsolation: true, nodeIntegration: false, sandbox: true,
          webSecurity: true, webviewTag: false, allowRunningInsecureContent: false,
          navigateOnDragDrop: false, spellcheck: false } });
      const currentWindow = window, currentTab = tab;
      try { main.contentView.removeChildView(currentTab.view); }
      catch (_) { currentWindow.close(); return { ok: false, error: 'Video görünümü taşınamadı.' }; }
      try { window.contentView.addChildView(currentTab.view); }
      catch (_) {
        // Görünüm ana pencereden söküldü ama yeni pencereye eklenemedi: geri
        // koymazsak sekme hiçbir pencerede değildir (boş sekme).
        try { main.contentView.addChildView(currentTab.view); } catch (__) {}
        window = null; tab = null;
        try { currentWindow.destroy(); } catch (__) {}
        restore();
        return { ok: false, error: 'Video görünümü taşınamadı.' };
      }
      // Yerel browser-mini.html dışına hiç gezinme yok: yeni pencere, sayfa
      // içi gezinme ve alt kare çıkışları reddedilir.
      window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      window.webContents.on('will-navigate', (e) => e.preventDefault());
      window.webContents.on('will-redirect', (e) => e.preventDefault());
      attachSubframeSchemeGuard(window.webContents);
      window.on('resize', layout);
      window.on('close', () => {
        // BrowserWindow.close() 'close' olayını eşzamanlı yaymaz (beforeunload
        // turu). open(B) eski pencereyi kapatıp hemen yenisini kurduğunda bu
        // işleyici geç çalışır; eskiden `window !== currentWindow` ise erken
        // dönüyordu ve A sekmesinin görünümü ne eski pencereden sökülüyor ne de
        // ana pencereye geri bağlanıyordu — A sekmesi kalıcı olarak boş kalırdı.
        // Görünüm iadesi HER kapanışta yapılır; yalnız durum sıfırlama güncel
        // pencereye özgüdür.
        const isCurrent = window === currentWindow;
        try { currentWindow.contentView.removeChildView(currentTab.view); } catch (_) {}
        if (isCurrent) { window = null; tab = null; }
        // Sekme bu arada yeni mini pencereye taşındıysa ana pencereye geri
        // bağlama: onu yeni pencere sahipleniyor.
        if (!isCurrent && tab === currentTab) return;
        // 'unloading': sekme bellekten boşaltılıyor — görünüm az sonra
        // yok edilecek; ana pencereye geri bağlayıp düzenlemek boşuna iş.
        if (currentTab.view && !currentTab.view.webContents.isDestroyed()
            && !currentTab.closing && currentTab.lifecycle !== 'unloading') {
          const main = owner();
          // Kapanan ana pencerede addChildView native tarafta fırlayabilir.
          if (main && !main.isDestroyed()) {
            try { main.contentView.addChildView(currentTab.view);
              // Geri eklenen view mini pencerenin sınırlarıyla görünür kalıp
              // ana pencerede işaretçiyi yutmasın: restore() gerçek yerleşimi
              // uygulayana dek ekran dışına çek.
              hideOffscreen?.(currentTab.view);
              restore();
            } catch (_) {}
          }
        }
      });
      window.loadFile(path.join(__dirname, 'renderer', 'browser-mini.html'));
      layout(); return { ok: true };
    },
  };
}
module.exports = { createBrowserMiniPlayer };
