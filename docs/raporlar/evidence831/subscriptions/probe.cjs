const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict'), crypto = require('node:crypto');
const { JSDOM } = require('jsdom');
const root = path.resolve(__dirname,'../../../..');
const dir = process.env.AUDIT831_OUT || path.join(root, '.uiprev/audit831-subscriptions-'+Date.now());
fs.mkdirSync(dir, { recursive: true });
const renderer = fs.readFileSync(path.join(root, 'src/renderer/renderer.js'), 'utf8');
const main = fs.readFileSync(path.join(root, 'src/main.js'), 'utf8');
const io = require(path.join(root, 'src/subscriptions-io.js'));
const block = renderer.slice(renderer.indexOf('const ST_SUBS_KEY ='), renderer.indexOf('async function stSearchLoadMore()'));
const id = n => 'UC' + String(n).padStart(22, '0');
const tick = () => new Promise(resolve => setImmediate(resolve));
let fileCounter = 0;
function fixture(initial = []) {
  const dom = new JSDOM('<div id="smarttubeBrowser"><div id="stGrid"></div></div><div id="playerStage"></div>', { url: 'https://synthetic.invalid' });
  const messages = [], handlers = {}, writes = [], filePath = path.join(dir, `synthetic-${++fileCounter}.json`);
  const context = vm.createContext({ ipcMain: { handle: (name, fn) => handlers[name] = fn }, authorizedBrowserSender: event => event.sender === 'fixture', path, fs,
    dialog: { showSaveDialog: async () => ({ canceled: false, filePath }), showOpenDialog: async () => ({ canceled: false, filePaths: [filePath] }) }, mainWindow: {}, dt: (tr, en) => en,
    writeBufferAtomic: (p, text) => { assert.equal(p, filePath); fs.writeFileSync(p, text); writes.push(p); } });
  vm.runInContext(main.slice(main.indexOf("ipcMain.handle('subscriptions:export',"), main.indexOf('// Yerel aboneliklerin YouTube RSS beslemeleri')), context);
  dom.window.SubscriptionIO = io;
  dom.window.api = { importSubscriptions: () => handlers['subscriptions:import']({ sender: 'fixture' }), exportSubscriptions: payload => handlers['subscriptions:export']({ sender: 'fixture' }, payload) };
  const c = vm.createContext({ window: dom.window, document: dom.window.document, localStorage: dom.window.localStorage, osd: s => messages.push(s), openAppDialog: async () => '', navigateBrowser() {}, openInvidiousChannelPage() {}, Date,
    $: id => dom.window.document.getElementById(id), stSectionSeq: 0, stActiveHomeRequestId: null, stCurrentSection: 'subscriptions', stSearchActive: false, youtubeLoggedIn: false, player: { mediaKey: 'synthetic-video' }, syncPlayerEmpty() {}, setSmartTubeStatus() {}, setTimeout: () => 0 });
  vm.runInContext(block, c);
  vm.runInContext(renderer.slice(renderer.indexOf('async function renderSmartTubeSection('), renderer.indexOf('// ----- Trend kategori')), c);
  vm.runInContext(renderer.slice(renderer.indexOf('function setSmartTubeVisible('), renderer.indexOf('function hideHomeOnVideoLoad()')), c);
  const run = s => vm.runInContext(s, c), grid = dom.window.document.getElementById('stGrid');
  const render = () => run('renderStSubsPanel(document.getElementById("stGrid"))');
  const click = async label => { const button = [...grid.querySelectorAll('.st-subs-head button')].find(b => b.textContent === label); assert.ok(button); button.click(); await tick(); await tick(); };
  const importSource = async subs => { const out = io.exportSubscriptions(subs, [], 'json'); fs.writeFileSync(filePath, out.text); render(); await click('İçe aktar'); };
  return { dom, c, grid, run, render, click, importSource, filePath, writes, messages, handlers };
}
(async () => {
 const out = { head: '34b5747b5181db819443cf708185b5eebce754f9', runtime: { node: process.version, platform: process.platform }, tests: {}, sources: {}, limits: ['No real YouTube network or personal profile.', 'Renderer production block in JSDOM; main handlers executed verbatim with controlled sender/dialog.', 'Atomic file-write adapter writes only synthetic fixture files; native dialog and Windows Electron UI not exercised.'] };
 for (const p of ['src/subscriptions-io.js', 'src/renderer/renderer.js', 'src/main.js']) out.sources[p] = crypto.createHash('sha256').update(fs.readFileSync(path.join(root, p), 'utf8').replace(/\r\n/g, '\n')).digest('hex');
 let f = fixture();
 await f.importSource([{ authorId: id(1), author: 'Grouped', group: 'Science' }, { authorId: id(2), author: 'Ungrouped', group: '' }]);
 assert.equal(f.grid.querySelectorAll('.st-sub-row').length, 2);
 [...f.grid.querySelectorAll('.st-chip')].find(b => b.textContent === 'Science').click();
 assert.equal(f.grid.querySelectorAll('.st-sub-row').length, 1);
 f.grid.querySelector('.st-sub-row .is-danger').click();
 const remaining = JSON.parse(f.dom.window.localStorage.getItem('stSubscriptions'));
 out.tests.groupRemoval = { imported: 2, persisted: remaining, visibleRows: f.grid.querySelectorAll('.st-sub-row').length, chips: f.grid.querySelectorAll('.st-chip').length, staleGroup: f.grid.dataset.stSubGroup, text: f.grid.textContent };
 assert.equal(remaining.length, 1); assert.equal(remaining[0].author, 'Ungrouped');
 assert.equal(out.tests.groupRemoval.visibleRows, 0); assert.equal(out.tests.groupRemoval.chips, 0); assert.equal(out.tests.groupRemoval.staleGroup, 'Science');
 // Public export still reaches hidden saved data; this is loss of access/filter state, not disk deletion.
 f.c.openAppDialog = async () => 'json'; await f.click('Dışa aktar');
 out.tests.groupRemoval.exportedRemaining = io.parseSubscriptions(fs.readFileSync(f.filePath, 'utf8')).subs.length;
 assert.equal(out.tests.groupRemoval.exportedRemaining, 1);
 f.run('setSmartTubeVisible(false); setSmartTubeVisible(true)'); await tick();
 out.tests.groupRemoval.closeReopenRows = f.grid.querySelectorAll('.st-sub-row').length; assert.equal(out.tests.groupRemoval.closeReopenRows, 0);
 await f.run('renderSmartTubeSection("subscriptions", { force: true })');
 out.tests.groupRemoval.forceRefreshRows = f.grid.querySelectorAll('.st-sub-row').length; assert.equal(out.tests.groupRemoval.forceRefreshRows, 0);
 f.grid.remove(); const replacement = f.dom.window.document.createElement('div'); replacement.id = 'stGrid'; f.dom.window.document.body.append(replacement); f.render();
 out.tests.groupRemoval.freshGridRows = replacement.querySelectorAll('.st-sub-row').length; assert.equal(out.tests.groupRemoval.freshGridRows, 1); f.dom.window.close();
 // Countercontrol: removing grouped channel while All selected leaves ungrouped row visible.
 f = fixture(); await f.importSource([{ authorId: id(1), author: 'Grouped', group: 'Science' }, { authorId: id(2), author: 'Ungrouped' }]);
 f.grid.querySelector('.st-sub-row .is-danger').click(); out.tests.allControl = { rows: f.grid.querySelectorAll('.st-sub-row').length, activeGroup: f.grid.dataset.stSubGroup || '' }; assert.equal(out.tests.allControl.rows, 1); f.dom.window.close();
 // Independent public mutation: clearing last group through actual dialog callback traps the same filter.
 f = fixture(); await f.importSource([{ authorId: id(1), author: 'Grouped', group: 'Science' }, { authorId: id(2), author: 'Ungrouped' }]);
 [...f.grid.querySelectorAll('.st-chip')].find(b => b.textContent === 'Science').click(); f.c.openAppDialog = async () => ''; f.grid.querySelector('.st-sub-row .st-mini-btn').click(); await tick();
 out.tests.groupClear = { rows: f.grid.querySelectorAll('.st-sub-row').length, chips: f.grid.querySelectorAll('.st-chip').length, saved: JSON.parse(f.dom.window.localStorage.getItem('stSubscriptions')) };
 assert.equal(out.tests.groupClear.rows, 0); assert.equal(out.tests.groupClear.saved.length, 2); assert.ok(out.tests.groupClear.saved.every(s => s.group === '')); f.dom.window.close();
 async function roundTrip(format, name) {
   const source = fixture(); await source.importSource([{ authorId: id(1), author: name }, { authorId: id(2), author: 'Second channel' }]);
   source.c.openAppDialog = async () => format; await source.click('Dışa aktar');
   const text = fs.readFileSync(source.filePath, 'utf8'); assert.ok(source.writes.length);
   const target = fixture(); fs.writeFileSync(target.filePath, text); target.render(); await target.click('İçe aktar');
   const saved = JSON.parse(target.dom.window.localStorage.getItem('stSubscriptions') || '[]');
   const result = { format, input: [{ authorId: id(1), author: name }, { authorId: id(2), author: 'Second channel' }], exported: text, saved, messages: target.messages, visibleRows: target.grid.querySelectorAll('.st-sub-row').length };
   source.dom.window.close(); target.dom.window.close(); return result;
 }
 out.tests.csvIdentity = await roundTrip('csv', `Guide to ${id(2)}`);
 assert.equal(out.tests.csvIdentity.saved.length, 1); assert.equal(out.tests.csvIdentity.saved[0].authorId, id(2));
 assert.ok(!out.tests.csvIdentity.saved.some(s => s.authorId === id(1)));
 out.tests.csvOrdinaryControl = await roundTrip('csv', 'Ordinary channel'); assert.equal(out.tests.csvOrdinaryControl.saved.length, 2);
 out.tests.csvQuoteControl = await roundTrip('csv', 'Comma, "quoted"\nchannel'); assert.equal(out.tests.csvQuoteControl.saved.length, 2); assert.equal(out.tests.csvQuoteControl.saved[0].author, 'Comma, "quoted"\nchannel');
 out.tests.jsonIdentityControl = await roundTrip('json', `Guide to ${id(2)}`); assert.equal(out.tests.jsonIdentityControl.saved.length, 2);
 out.assertions = 'PASS: two current bug mechanisms and positive/negative countercontrols; exit0 confirms defects, not fixes.';
 fs.writeFileSync(path.join(dir, 'result.json'), JSON.stringify(out, null, 2));
 console.log(JSON.stringify({ assertions: out.assertions, resultPath: path.join(dir, 'result.json'), group: out.tests.groupRemoval, csv: out.tests.csvIdentity }, null, 2));
})().catch(e => { console.error(e); process.exitCode = 1; });
