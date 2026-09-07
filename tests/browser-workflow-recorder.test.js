const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  BrowserWorkflowPlayer,
  BrowserWorkflowRecorder,
  MAX_SAVED_WORKFLOWS,
  normalizeStep,
  resolveWorkflowTrack,
  normalizeWorkflowLibrary,
} = require('../src/browser-workflow-recorder');

let passed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log(`  PASS  ${name}`); }
  catch (error) { console.error(`  FAIL  ${name}\n${error.stack}`); process.exitCode = 1; }
}

(async () => {
  await test('yalnız semantik izinli alanlar kaydedilir; sır ve URL atılır', () => {
    assert.deepEqual(normalizeStep({ command: 'loadSourceTrack', args: {
      trackId: 'track-en', token: 'secret', cookie: 'sid=x', url: 'https://x.test/?sig=secret', x: 99,
      language: 'EN-us', role: 'source', label: 'English',
    } }), { command: 'loadSourceTrack', args: {
      trackId: 'track-en', language: 'en-us', role: 'source', label: 'English',
    } });
    assert.equal(normalizeStep({ command: 'clickSelector', args: { selector: '.buy' } }), null);
    assert.equal(normalizeStep({ command: 'openSettings', args: { page: 'secrets' } }), null);
  });

  await test('değişen geçici iz kimliği dil ve rolle yeniden bağlanır', () => {
    const step = normalizeStep({ command: 'translateTrack', args: {
      trackId: 'old-network-id', language: 'en', role: 'source', label: 'English CC',
    } });
    const tracks = [
      { id: 'new-tr-id', language: 'tr', role: 'source', label: 'Türkçe' },
      { id: 'new-network-id', language: 'en', role: 'source', label: 'English CC' },
    ];
    assert.equal(resolveWorkflowTrack(step, tracks).id, 'new-network-id');
    const renderer = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'renderer.js'), 'utf8');
    assert.match(renderer, /resolveWorkflowTrack\(step, player\.browserTracks\)/);
    assert.match(renderer, /workflowTrackArgs\(browserTrackSelection\(false\)\)/);
  });

  await test('kayıt kalıcı iz kimliğini ve güvenli komutları korur', () => {
    const recorder = new BrowserWorkflowRecorder();
    recorder.start({ tabId: 'a', generation: 1, mediaId: 'youtube:one' }, 'Ders');
    assert.equal(recorder.record('loadSourceTrack', { trackId: 'en' }), true);
    assert.equal(recorder.record('setSubtitleMode', { mode: 'translation' }), true);
    assert.equal(recorder.record('unknown', {}), false);
    const workflow = recorder.stop();
    assert.equal(workflow.mediaIdentity, 'youtube:one');
    assert.deepEqual(workflow.steps.map((step) => step.command), ['loadSourceTrack', 'setSubtitleMode']);
  });

  await test('aynı medya başka sekmede oynatılabilir ve komutlar sırayı korur', async () => {
    const player = new BrowserWorkflowPlayer();
    const calls = [];
    const context = { tabId: 'new-tab', generation: 4, mediaId: 'youtube:one' };
    const result = await player.play({ id: 'w', mediaIdentity: 'youtube:one', steps: [
      { command: 'loadSourceTrack', args: { trackId: 'en' } },
      { command: 'setSubtitleMode', args: { mode: 'translation' } },
    ] }, { getContext: () => context, execute: async (step) => calls.push(step.command) });
    assert.deepEqual(calls, ['loadSourceTrack', 'setSubtitleMode']);
    assert.deepEqual(result, { ok: true, completed: 2, total: 2 });
  });

  await test('komut sırasında navigation değişirse sonraki adım uygulanmaz', async () => {
    const player = new BrowserWorkflowPlayer();
    let generation = 1;
    const calls = [];
    await assert.rejects(player.play({ mediaIdentity: 'video', steps: [
      { command: 'openSettings', args: { page: 'browser-subtitles' } },
      { command: 'setSubtitleMode', args: { mode: 'translation' } },
    ] }, {
      getContext: () => ({ tabId: 'a', generation, mediaId: 'video' }),
      execute: async (step) => { calls.push(step.command); generation = 2; },
    }), (error) => error.code === 'EWORKFLOW_STALE');
    assert.deepEqual(calls, ['openSettings']);
  });

  await test('farklı medya ve eşzamanlı ikinci oynatma reddedilir', async () => {
    const player = new BrowserWorkflowPlayer();
    const workflow = { mediaIdentity: 'video-a', steps: [{ command: 'setSubtitleMode', args: { mode: 'source' } }] };
    await assert.rejects(player.play(workflow, {
      getContext: () => ({ tabId: 'a', generation: 1, mediaId: 'video-b' }), execute: async () => {},
    }), (error) => error.code === 'EWORKFLOW_MEDIA');
    let release;
    const first = player.play(workflow, {
      getContext: () => ({ tabId: 'a', generation: 1, mediaId: 'video-a' }),
      execute: () => new Promise((resolve) => { release = resolve; }),
    });
    await Promise.resolve();
    await assert.rejects(player.play(workflow, {
      getContext: () => ({ tabId: 'a', generation: 1, mediaId: 'video-a' }), execute: async () => {},
    }), (error) => error.code === 'EWORKFLOW_BUSY');
    release();
    await first;
  });

  await test('workflow kitaplığı bozuk adımları atar ve sınırlı kalır', () => {
    const rows = Array.from({ length: MAX_SAVED_WORKFLOWS + 5 }, (_, index) => ({
      id: `w-${index}`, createdAt: index, mediaIdentity: 'video',
      steps: [{ command: 'setSubtitleMode', args: { mode: 'source' } },
        { command: 'bad', args: { token: 'secret' } }],
    }));
    const library = normalizeWorkflowLibrary(rows);
    assert.equal(library.length, MAX_SAVED_WORKFLOWS);
    assert(library.every((row) => row.steps.length === 1));
    assert.doesNotMatch(JSON.stringify(library), /secret/);
  });

  if (!process.exitCode) console.log(`\n${passed} browser workflow kayıt/oynatma testi geçti.`);
})().catch((error) => { console.error(error.stack || error); process.exit(1); });
