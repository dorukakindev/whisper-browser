'use strict';
const path = require('node:path');
const { spawnSync } = require('node:child_process');

// Windows Store takma adı bir Python yorumlayıcısı değildir. Aynı keşfi hem
// tüm paket hem gerçek subprocess fixture'ları kullanır.
function findTestPython({ root = path.resolve(__dirname, '..'), env = process.env,
  platform = process.platform, probe = spawnSync } = {}) {
  const candidates = [
    ...(env.WHISPER_TEST_PYTHON ? [[env.WHISPER_TEST_PYTHON, []]] : []),
    [path.join(root, 'backend', 'venv', platform === 'win32' ? 'Scripts/python.exe' : 'bin/python'), []],
    [path.join(root, 'backend', '.venv', platform === 'win32' ? 'Scripts/python.exe' : 'bin/python'), []],
    ...(platform === 'win32' ? [['py', ['-3.11']], ['py', ['-3.10']], ['py', ['-3']]] : []),
    ['python3', []], ['python', []],
  ];
  for (const [command, prefix] of candidates) {
    const result = probe(command, [...prefix, '-c', 'import sys; print(sys.executable)'],
      { cwd: root, encoding: 'utf8', timeout: 5000, windowsHide: true });
    const executable = String(result.stdout || '').trim();
    if (!result.error && result.status === 0 && path.isAbsolute(executable)) return executable;
  }
  return null;
}
module.exports = { findTestPython };
