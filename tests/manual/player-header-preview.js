// Isolated header layout fixture. No Electron, user data, provider calls or renderer JS.
// Run: node tests/manual/player-header-preview.js
const http = require('http');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '../../src/renderer');
http.createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  if (url.pathname === '/styles.css') {
    res.setHeader('Content-Type', 'text/css; charset=utf-8');
    res.end(fs.readFileSync(path.join(root, 'styles.css')));
    return;
  }
  if (url.pathname !== '/') { res.writeHead(404).end(); return; }
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const start = html.indexOf('<div class="player-head">');
  const end = html.indexOf('<div class="player-body">', start);
  if (start < 0 || end < 0) { res.writeHead(500).end('Header fixture boundary missing'); return; }
  const header = html.slice(start, end);
  const collapsed = url.searchParams.get('panel') !== 'open';
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end(`<!doctype html><html lang="tr"><head><meta charset="utf-8"><link rel="stylesheet" href="/styles.css"></head><body>
    <div class="player-layer ${collapsed ? 'sidebar-collapsed' : ''}">${header}</div></body></html>`);
}).listen(18764, '127.0.0.1', () => console.log('Header fixture: http://127.0.0.1:18764/ (or ?panel=open)'));
