const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  progressOf,
  browserJobDescriptor,
  elapsedLabel,
} = require('../src/player-task-center');

assert.deepEqual(progressOf({ completed: 39, total: 224 }), {
  completed: 39,
  total: 224,
  percent: 39 / 224 * 100,
  indeterminate: false,
});
assert.equal(progressOf({ percent: 140 }).percent, 100);
assert.equal(progressOf({ completed: 2, total: 0 }).indeterminate, true);
assert.equal(elapsedLabel(1_000, 66_000), '1:05');
assert.equal(elapsedLabel(1_000, 3_662_000), '1:01:01');

const active = browserJobDescriptor({
  id: 'subtitle:1',
  kind: 'subtitle-translation',
  status: 'running',
  title: 'Lecture 7',
  completed: 39,
  total: 224,
  pending: 2,
  queued: 8,
  actions: ['cancel', 'retry'],
});
assert.equal(active.label, 'Altyazı çevirisi');
assert.equal(active.active, true);
assert.equal(active.recoverable, false);
assert.equal(active.progress.percent.toFixed(1), '17.4');
assert.equal(active.pending, 2);
assert.equal(active.queued, 8);

const recovery = browserJobDescriptor({
  id: 'recovery:1',
  kind: 'page-translation',
  state: 'interrupted',
  completed: 12,
  total: 20,
  actions: ['resume', 'restart', 'dismiss'],
});
assert.equal(recovery.recoverable, true);
assert.equal(recovery.dismissable, true);
assert.equal(recovery.stage, 'Yarım kaldı');
assert.equal(recovery.progress.percent, 60);

const stoppedCapture = browserJobDescriptor({
  kind: 'subtitle-capture', status: 'cancelled', actions: ['retry', 'dismiss'],
});
assert.equal(stoppedCapture.recoverable, false);
assert.equal(stoppedCapture.dismissable, true);

const root = path.join(__dirname, '..', 'src');
const renderer = fs.readFileSync(path.join(root, 'renderer', 'renderer.js'), 'utf8');
const main = fs.readFileSync(path.join(root, 'main.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'renderer', 'index.html'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'renderer', 'styles.css'), 'utf8');

assert(html.indexOf('../player-task-center.js') < html.indexOf('renderer.js'),
  'Active Jobs modeli renderer.js öncesinde yüklenmeli');
assert.match(renderer, /runBrowserTaskAction[\s\S]*stopBrowserTranslation/);
assert.match(renderer, /runBrowserTaskAction[\s\S]*clearBrowserPageTranslation/);
assert.match(renderer, /runBrowserTaskAction[\s\S]*clearBrowserManga/);
assert.match(renderer, /runBrowserTaskAction[\s\S]*captureFullBrowserSubtitle/);
assert.match(renderer, /runBrowserTaskAction[\s\S]*browserDownloads/);
assert.match(renderer, /player-task-dismiss/);
assert.match(renderer, /playerTaskPulseTimer = setInterval/);
assert.match(main, /browserDownloads\.snapshot\(\)\.items/);
assert.match(main, /completed: Number\(item\.received\)/);
assert.match(styles, /\.player-task-progress\.indeterminate/);
assert.match(styles, /prefers-reduced-motion/);

console.log('Active Jobs: structured progress, live controls, recovery dismissal and download fields passed.');
