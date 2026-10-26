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
    const width = expanded ? Math.min(large ? 780 : 480, Math.max(160, w - 24)) : 64;
    const bottom = 24 + Math.min(Math.max(0, Number(snapshot.bottomInset) || 0), h / 2);
    const height = expanded ? Math.min(large ? 850 : 720, Math.max(150, h - bottom - 40)) : 64;
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
      opened:expanded,
      palette:Object.fromEntries(['surface','raised','hover','line','strong','text','muted','accent'].flatMap(key=>/^#[a-f0-9]{6}$/i.test(value.palette?.[key]||'')?[[key,value.palette[key]]]:[])),
      locale: value.locale === 'tr' ? 'tr' : 'en', theme: value.theme === 'light' ? 'light' : 'dark',
      sourceToken:String(value.sourceToken||'').slice(0,8000),
      model:String(value.model||'').slice(0,200),sourceDescription:String(value.sourceDescription||'').slice(0,1400),
      pageContext:!!value.pageContext,videoContext:!!value.videoContext,transcriptScope:!!value.transcriptScope,blocked:!!value.blocked,canCancel:!!value.canCancel,
      receipt:value.receipt&&typeof value.receipt==='object'?{id:String(value.receipt.id||'').slice(0,80),accepted:!!value.receipt.accepted,message:String(value.receipt.message||'').slice(0,1200)}:null,
      conversation: String(value.conversation || '').slice(0,8000),
      pinScope:String(value.pinScope||value.conversation||'').slice(0,8000),activeThread:String(value.activeThread||'').slice(0,100),
      jobs:Array.isArray(value.jobs)?value.jobs.slice(0,50).map(row=>({id:String(row.id||'').slice(0,100),kind:String(row.kind||'').slice(0,40),state:String(row.state||'').slice(0,20),stage:String(row.stage||'').slice(0,60),percent:Number.isFinite(row.percent)?Math.max(0,Math.min(100,row.percent)):null,cancellable:row.cancellable===true,partial:row.partial===true,stopFailed:row.stopFailed===true})):[],
      workspaceError:String(value.workspaceError||'').slice(0,1200),draft:String(value.draft||'').slice(0,16000),
      threads:Array.isArray(value.threads)?value.threads.slice(0,20).map(row=>({id:String(row.id||'').slice(0,100),title:String(row.title||'').slice(0,200)})):[],
      context: String(value.context || '').slice(0, 600), busy: !!value.busy, retry: !!value.retry,
      scope: ['nearby', 'watched', 'full'].includes(value.scope) ? value.scope : 'watched',
      bottomInset: Math.min(400, Math.max(0, Number(value.bottomInset) || 0)),
      suggestions: Array.isArray(value.suggestions) ? value.suggestions.slice(0, 5).map(row => ({ id:String(row.id || '').slice(0, 100), direct:!!row.direct, label:String(row.label || '').slice(0, 120), review:String(row.review || '').slice(0, 1800) })) : [],
      messages: Array.isArray(value.messages) ? value.messages.slice(-200).map(row => ({
        id:String(row.id||'').slice(0,100),status:String(row.status||'').slice(0,20),
        actions:Array.isArray(row.actions)?row.actions.slice(0,8).map(a=>({id:String(a.id||'').slice(0,200),kind:String(a.kind||'').slice(0,60),label:String(a.label||'').slice(0,120),canContinue:a.canContinue===true,waiting:a.waiting===true,resultStatus:String(a.resultStatus||'').slice(0,20),resultText:String(a.resultText||'').slice(0,500),excerpt:String(a.excerpt||'').slice(0,1200),translation:String(a.translation||'').slice(0,2000)})):[],
        role: row.role === 'user' ? 'user' : 'ai',loading:!!row.loading,error:!!row.error,text: String(row.text || '').slice(0, 32000),
        links: Array.isArray(row.links) ? row.links.slice(0, 40).map(link => ({ id: String(link.id || '').slice(0, 200),excerpt:String(link.excerpt||'').slice(0,1200),translation:String(link.translation||'').slice(0,1200), label: String(link.label || '').slice(0, 80) })) : [],
      })) : [],
    };
    if (!view.webContents.isDestroyed()) view.webContents.send('assistant:snapshot', snapshot);
    layout();
  }
  function command(event, packet) {
    if (!ownView(event) || !packet || typeof packet !== 'object') return;
    const action = packet.action;
    if (action === 'ready') { view.webContents.send('assistant:snapshot', snapshot); return; }
    if (action === 'toggle') { expanded = !expanded; window.webContents.send('assistant:visibility',{expanded}); layout(); if (!expanded) window.webContents.focus(); return; }
    if (action === 'expand') { large = !large; layout(); return; }
    if (!['send', 'web-search', 'cancel', 'retry', 'clear', 'scope', 'citation', 'suggestion', 'copy', 'export','new-thread','select-thread','rename-thread','delete-thread','branch','apply-tool','continue-tool','cancel-job'].includes(action)) return;
    window.webContents.send('assistant:command', { action, sourceToken:String(packet.sourceToken||'').slice(0,8000),requestId:String(packet.requestId||'').slice(0,80),text: String(packet.text || '').slice(0, action==='export'?8000000:action==='copy'?32000:16000) });
  }
  const show = event => { if(event.sender!==window.webContents||event.senderFrame!==window.webContents.mainFrame)return; expanded=true; snapshot.opened=true; view.webContents.send('assistant:snapshot',snapshot); window.webContents.send('assistant:visibility',{expanded}); layout(); };
  const showHandler=(event,...args)=>{if(!owner(event))return;show(event,...args);};
  const updateHandler=(event,...args)=>{if(!owner(event))return;update(event,...args);};
  const commandHandler=(event,...args)=>{if(!ownView(event))return;command(event,...args);};
  ipcMain.on('assistant:show', showHandler);
  ipcMain.on('assistant:update', updateHandler);
  ipcMain.on('assistant:action', commandHandler);
  window.on('resize', layout); window.on('enter-full-screen', layout); window.on('leave-full-screen', layout);
  view.webContents.on('did-finish-load', () => { layout(); view.webContents.send('assistant:snapshot', snapshot); });
  window.once('closed', () => {
    disposed = true;
    ipcMain.removeListener('assistant:show', showHandler);
    ipcMain.removeListener('assistant:update', updateHandler); ipcMain.removeListener('assistant:action', commandHandler);
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
