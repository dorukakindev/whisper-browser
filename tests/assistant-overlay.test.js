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
  ipcMain.emit('assistant:update', {sender:window.webContents,senderFrame:{}}, {messages:[{text:'subframe spoof'}]});
  ipcMain.emit('assistant:action', {sender:view.webContents,senderFrame:{}}, {action:'send',text:'subframe spoof'});
  assert.equal(sent.length, 0);
  ipcMain.emit('assistant:update', parent, { apiKey: 'not-forwarded',palette:{accent:'#d5a35c',text:'url(secret)'}, locale: 'tr', scope: 'full',pinScope:'media',activeThread:'one',threads:[{id:'one',title:'First'}],messages: [{id:'reply', role: 'user', text: '<img onerror=bad>',links:[{id:'x'.repeat(85),excerpt:'verified'}],actions:[{id:'proposal',kind:'seek_to_time',canContinue:true,waiting:true}]}] });
  assert.equal(sent[0].value.apiKey, undefined);
  assert.equal(sent[0].value.messages[0].actions[0].canContinue,true);assert.equal(sent[0].value.messages[0].actions[0].waiting,true);
  assert.deepEqual(sent[0].value.palette,{accent:'#d5a35c'});
  assert.equal(sent[0].value.activeThread,'one');assert.equal(sent[0].value.pinScope,'media');assert.equal(sent[0].value.messages[0].links[0].id.length,85);
  assert.equal(sent[0].value.messages[0].text, '<img onerror=bad>', 'Rendered as text by the view, never HTML');
  ipcMain.emit('assistant:action', overlay, { action: 'toggle' });
  assert(view.bounds.width > 300 && view.bounds.width < 680);
  ipcMain.emit('assistant:action', overlay, { action: 'send', text: 'question' });
  assert.deepEqual(sent.at(-1), { channel: 'assistant:command', value: { action: 'send', sourceToken:'',requestId:'',text: 'question' } });
  ipcMain.emit('assistant:action',overlay,{action:'continue-tool',text:'proposal'});assert.equal(sent.at(-1).value.action,'continue-tool');
  ipcMain.emit('assistant:show', foreign);
  ipcMain.emit('assistant:show', parent);
  assert.equal(sent.findLast(row=>row.channel==='assistant:snapshot').value.opened,true);
  assert(view.bounds.width>300);
  window.emit('closed');
  assert.equal(ipcMain.listenerCount('assistant:show'),0);
  assert.equal(ipcMain.listenerCount('assistant:update'), 0);
  assert.equal(ipcMain.listenerCount('assistant:action'), 0);
});
