'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createAssistantOverlay } = require('../src/assistant-overlay');

test('native assistant accepts only its own frame; provider secrets and arbitrary actions are never forwarded', () => {
  const ipcMain = new EventEmitter(), window = new EventEmitter();
  const sent = [], views = [];
  const contents = () => Object.assign(new EventEmitter(), {
    mainFrame: {}, send: (channel, value) => sent.push({ channel, value }),
    isDestroyed: () => false, setWindowOpenHandler() {}, loadFile: async () => {}, close() {}, focus() {},
  });
  window.webContents = contents(); window.isDestroyed = () => false;
  window.getContentSize = () => [680, 780]; window.isFullScreen = () => false;
  window.contentView = { addChildView(view) { views.push(view); } };
  class View { constructor() { this.webContents = contents(); } setBackgroundColor() {} setBounds(value) { this.bounds = value; } setVisible(value) { this.visible = value; } }
  createAssistantOverlay({ window, WebContentsView: View, ipcMain });
  const view = views[0];
  const parent = { sender: window.webContents, senderFrame: window.webContents.mainFrame };
  const overlay = { sender: view.webContents, senderFrame: view.webContents.mainFrame };
  const foreign = { sender: contents(), senderFrame: {} };
  ipcMain.emit('assistant:action', foreign, { action: 'send', text: 'unauthorized' });
  ipcMain.emit('assistant:action', overlay, { action: 'openFile', text: 'secret' });
  ipcMain.emit('assistant:update', foreign, { messages: [{ text: 'spoofed' }] });
  assert.equal(sent.length, 0);
  ipcMain.emit('assistant:update', parent, { apiKey: 'not-forwarded', locale: 'tr', scope: 'full', messages: [{ role: 'user', text: '<img onerror=bad>' }] });
  assert.equal(sent[0].value.apiKey, undefined);
  assert.equal(sent[0].value.messages[0].text, '<img onerror=bad>', 'Rendered as text by the view, never HTML');
  ipcMain.emit('assistant:action', overlay, { action: 'toggle' });
  assert(view.bounds.width > 300 && view.bounds.width < 680);
  ipcMain.emit('assistant:action', overlay, { action: 'send', text: 'question' });
  assert.deepEqual(sent.at(-1), { channel: 'assistant:command', value: { action: 'send', text: 'question' } });
  window.emit('closed');
  assert.equal(ipcMain.listenerCount('assistant:update'), 0);
  assert.equal(ipcMain.listenerCount('assistant:action'), 0);
});
