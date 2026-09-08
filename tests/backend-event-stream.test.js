const assert = require('assert');
const {
  MALFORMED_EVENT_MESSAGE,
  NO_TERMINAL_MESSAGE,
  createBackendEventStream,
  createStderrCollector,
  redactSensitiveText,
} = require('../src/backend-event-stream');

let pass = 0;
function test(name, fn) {
  try { fn(); pass++; console.log(`  PASS  ${name}`); }
  catch (error) { console.error(`  FAIL  ${name} — ${error.stack || error.message}`); process.exitCode = 1; }
}

function harness(options = {}) {
  const events = [];
  const protocolErrors = [];
  const stream = createBackendEventStream({
    ...options,
    onEvent: (event) => events.push(event),
    onProtocolError: (event) => protocolErrors.push(event),
  });
  return { stream, events, protocolErrors };
}

test('malformed olay secret sızdırmaz ve sonraki sağlam olayı zehirlemez', () => {
  const { stream, events, protocolErrors } = harness();
  stream.push(Buffer.from(
    'api_key=sk-proj-cokgizlibirdeger {bozuk}\n{"type":"progress","percent":25}\n{"type":"done"}\n',
    'utf8',
  ));
  const result = stream.settle({ code: 0 });
  assert.deepEqual(events, [{ type: 'progress', percent: 25 }]);
  assert.equal(result.terminal.type, 'done');
  assert.equal(protocolErrors.length, 1);
  assert.equal(protocolErrors[0].message, MALFORMED_EVENT_MESSAGE);
  assert.ok(!JSON.stringify(protocolErrors).includes('cokgizli'));
});

test('ilk done/error terminalini korur ve yinelenen terminalleri tekilleştirir', () => {
  const { stream, events, protocolErrors } = harness();
  stream.push('{"type":"done","segments":2}\n{"type":"error","message":"geç hata"}\n');
  const first = stream.settle({ code: 0, stderr: '' });
  const second = stream.settle({ code: 0, stderr: '' });
  assert.equal(first.terminal.type, 'done');
  assert.equal(first.terminal.segments, 2);
  assert.equal(second, null);
  assert.deepEqual(events, []);
  assert.equal(protocolErrors.length, 1);
  assert.match(protocolErrors[0].message, /birden fazla sonuç olayı/);
});

test('sonuç olayı olmadan kod 0 kapanışı Türkçe hata üretir', () => {
  const { stream } = harness();
  stream.push('{"type":"progress","percent":100}\n');
  const result = stream.settle({ code: 0 });
  assert.deepEqual(result.terminal, { type: 'error', message: NO_TERMINAL_MESSAGE });
  assert.deepEqual(result.exit, { type: 'exit', code: 0, stderr: '' });
});

test('done sonrasındaki başarısız process exit başarıyı hata sonucuna çevirir', () => {
  const { stream } = harness();
  stream.push('{"type":"done","segments":1}\n');
  const result = stream.settle({ code: 7, stderr: 'fatal' });
  assert.deepEqual(result.terminal, { type: 'error', message: 'Backend süreci 7 çıkış koduyla kapandı.' });
  assert.equal(result.exit.code, 7);
});

test('kullanıcı iptali sentetik hata terminali üretmez', () => {
  const { stream } = harness();
  stream.push('{"type":"done","segments":1}\n');
  const result = stream.settle({ code: 1, processError: 'kill hatası', cancelled: true });
  assert.equal(result.terminal, null);
  assert.deepEqual(result.exit, { type: 'exit', code: 1, stderr: '' });
});

test('process error ve hassas stderr tek terminal/exit içinde güvenli taşınır', () => {
  const { stream } = harness();
  const result = stream.settle({
    code: null,
    processError: 'Authorization: Bearer abc.def.ghi',
    stderr: 'token=asla-yazma',
  });
  assert.equal(result.terminal.type, 'error');
  assert.ok(result.terminal.message.includes('[GİZLENDİ]'));
  assert.ok(!result.terminal.message.includes('abc.def.ghi'));
  assert.ok(!result.exit.stderr.includes('asla-yazma'));
});

test('log ve error olaylarının hassas metinleri redakte edilir', () => {
  const { stream, events } = harness();
  stream.push('{"type":"log","message":"api_key=super-secret"}\n');
  stream.push('{"type":"error","message":"hf_abcdefghijk","traceback":"token: xyz123"}\n');
  const result = stream.settle({ code: 0 });
  assert.ok(events[0].message.includes('[GİZLENDİ]'));
  assert.ok(!events[0].message.includes('super-secret'));
  assert.ok(!result.terminal.message.includes('hf_abcdefghijk'));
  assert.ok(!result.terminal.traceback.includes('xyz123'));
});

test('stderr taşması bellekte tutulmaz, sonraki satır işlenir ve secret loglanmaz', () => {
  const logs = [];
  const stderr = createStderrCollector({
    maxLineBytes: 1024,
    maxTailChars: 1000,
    maxLogChars: 1000,
    onLog: (event) => logs.push(event),
  });
  stderr.push(Buffer.from(`token=${'s'.repeat(2000)}`, 'utf8'));
  stderr.push(Buffer.from('\nAuthorization: Bearer stderr-secret\nson hata\n', 'utf8'));
  stderr.end();
  const serialized = JSON.stringify(logs);
  assert.equal(logs.length, 3);
  assert.match(logs[0].message, /stderr satırı .* baytı aştığı/);
  assert.ok(!serialized.includes('stderr-secret'));
  assert.ok(!serialized.includes('s'.repeat(100)));
  assert.ok(serialized.includes('[GİZLENDİ]'));
  assert.ok(stderr.getTail().length <= 1000);
  assert.ok(stderr.getTail().includes('son hata'));
});

test('redaksiyon Bearer, anahtar ve token biçimlerini kapsar', () => {
  const safe = redactSensitiveText(
    'Bearer abcdef123456 api_key="secret value" token=foo; hf_abcdefghijkl sk-proj-abcdefghijkl',
  );
  for (const secret of ['abcdef123456', 'secret value', 'foo', 'hf_abcdefghijkl', 'sk-proj-abcdefghijkl']) {
    assert.ok(!safe.includes(secret), secret);
  }
});

if (!process.exitCode) console.log(`\n${pass} backend olay akışı testi geçti.`);
