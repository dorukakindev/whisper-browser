'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { createSystemPowerStatus, parseWindowsPowerStatus } = require('../src/system-power-status');
test('Native saver flag is distinct from AC power and unknown battery percentage stays unknown', () => {
  assert.deepEqual(parseWindowsPowerStatus('{"ac":1,"percent":80,"saver":1}'), { ok: true, source: 'windows', onBattery: false, saverEnabled: true, batteryPercent: 80 });
  assert.equal(parseWindowsPowerStatus('{"ac":0,"percent":80,"saver":0}').saverEnabled, false);
  assert.deepEqual(parseWindowsPowerStatus('{"ac":255,"percent":255,"saver":0}', true), { ok: true, source: 'windows', onBattery: true, saverEnabled: false, batteryPercent: null });
  for (const input of ['bad', '{}', '{"ac":0,"percent":60,"saver":7}']) assert.equal(parseWindowsPowerStatus(input), null);
});
test('Windows query is fixed, hidden, bounded and coalesced with a 30-second cache', async () => {
  let time = 100, calls = 0, complete;
  const reader = createSystemPowerStatus({ platform: 'win32', now: () => time, powershellPath: 'fixed-powershell.exe', execFile: (exe, args, options, callback) => {
    calls++; complete = callback;
    assert.equal(exe, 'fixed-powershell.exe'); assert.equal(args[0], '-NoProfile'); assert.equal(args[1], '-NonInteractive');
    assert.match(args[3], /GetSystemPowerStatus/); assert.doesNotMatch(args[3], /SetSystemPower|Set-Item|Invoke-Expression/);
    assert.equal(options.windowsHide, true); assert.equal(options.timeout, 3000); assert.equal(options.maxBuffer, 4096);
  } });
  const first = reader.read(), second = reader.read(); assert.equal(calls, 1);
  complete(null, '{"ac":0,"percent":45,"saver":1}'); assert.equal((await first).saverEnabled, true); await second;
  await reader.read(); assert.equal(calls, 1);
  time += 30001; const third = reader.read(); assert.equal(calls, 2); complete(Error('timeout')); const fallback = await third;
  assert.equal(fallback.saverEnabled, null); assert.equal(fallback.source, 'electron');
});
test('Unavailable native reader reports unknown saver, uses Electron battery flag and never spawns on other platforms', async () => {
  const reader = createSystemPowerStatus({ platform: 'linux', getOnBattery: () => true, execFile: () => { throw Error('must not spawn'); } });
  assert.deepEqual(await reader.read(), { ok: true, source: 'electron', saverEnabled: null, onBattery: true, batteryPercent: null });
});
