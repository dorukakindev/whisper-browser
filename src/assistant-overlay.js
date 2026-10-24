'use strict';
const path = require('node:path');
const { pathToFileURL } = require('node:url');

// The overlay has no file, provider, browser or shell API. The existing renderer
// owns chat state and jobs; this native view only mirrors text and sends actions.
function createAssistantOverlay({ window, WebContentsView, ipcMain }) {
  const file = path.join(__dirname, 'renderer', 'assistant-overlay.html');
  const url = pathToFileURL(file).href;
  const view = new WebContentsView({ webPreferences: {
    preload: path.join(__dirname, 'assistant-overlay-preload.js'),
    contextIsolation: true, sandbox: true, nodeIntegration: false,
    partition: 'assistant-overlay',
  } });
  let expanded = false, large = false, disposed = false, snapshot = {};
  view.setBackgroundColor('#00000000');
  view.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  view.webContents.on('will-navigate', (event, target) => { if (target !== url) event.preventDefault(); });
  function layout() {
    if (disposed || window.isDestroyed()) return;
    const [w, h] = window.getContentSize();
    const width = expanded ? Math.min(large ? 780 : 430, Math.max(160, w - 24)) : 64;
    const bottom = 24 + Math.min(Math.max(0, Number(snapshot.bottomInset) || 0), h / 2);
    const height = expanded ? Math.min(large ? 850 : 640, Math.max(150, h - bottom - 40)) : 64;
    view.setBounds({ x: Math.max(0, w - width - 16), y: Math.max(38, h - height - bottom), width, height });
    view.setVisible(!window.isFullScreen());
    // Browser tabs may have just been added above us. Move this view to the top.
    window.contentView.addChildView(view);
  }
  const owner = event => event.sender === window.webContents && event.senderFrame === window.webContents.mainFrame;
  const ownView = event => event.sender === view.webContents && event.senderFrame === view.webContents.mainFrame;
  function update(event, value) {
    if (!owner(event) || !value || typeof value !== 'object') return;
    snapshot = {
      locale: value.locale === 'tr' ? 'tr' : 'en', theme: value.theme === 'light' ? 'light' : 'dark',
      context: String(value.context || '').slice(0, 600), busy: !!value.busy, retry: !!value.retry,
      scope: ['nearby', 'watched', 'full'].includes(value.scope) ? value.scope : 'watched',
      bottomInset: Math.min(400, Math.max(0, Number(value.bottomInset) || 0)),
      messages: Array.isArray(value.messages) ? value.messages.slice(-200).map(row => ({
        role: row.role === 'user' ? 'user' : 'ai', text: String(row.text || '').slice(0, 32000),
        links: Array.isArray(row.links) ? row.links.slice(0, 40).map(link => ({ id: String(link.id || '').slice(0, 64), label: String(link.label || '').slice(0, 80) })) : [],
      })) : [],
    };
    if (!view.webContents.isDestroyed()) view.webContents.send('assistant:snapshot', snapshot);
    layout();
  }
  function command(event, packet) {
    if (!ownView(event) || !packet || typeof packet !== 'object') return;
    const action = packet.action;
    if (action === 'ready') { view.webContents.send('assistant:snapshot', snapshot); return; }
    if (action === 'toggle') { expanded = !expanded; layout(); if (!expanded) window.webContents.focus(); return; }
    if (action === 'expand') { large = !large; layout(); return; }
    if (!['send', 'cancel', 'retry', 'clear', 'scope', 'citation'].includes(action)) return;
    window.webContents.send('assistant:command', { action, text: String(packet.text || '').slice(0, 16000) });
  }
  ipcMain.on('assistant:update', update);
  ipcMain.on('assistant:action', command);
  window.on('resize', layout); window.on('enter-full-screen', layout); window.on('leave-full-screen', layout);
  view.webContents.on('did-finish-load', () => { layout(); view.webContents.send('assistant:snapshot', snapshot); });
  window.once('closed', () => {
    disposed = true;
    ipcMain.removeListener('assistant:update', update); ipcMain.removeListener('assistant:action', command);
    if (!view.webContents.isDestroyed()) view.webContents.close();
  });
  window.contentView.addChildView(view); layout();
  void view.webContents.loadFile(file).catch(() => {
    disposed = true;
    if (!window.isDestroyed()) window.contentView.removeChildView(view);
    if (!view.webContents.isDestroyed()) view.webContents.close();
  });
  return { raise: layout };
}
module.exports = { createAssistantOverlay };
