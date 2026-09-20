#!/usr/bin/env node
'use strict';

const { spawn } = require('node:child_process');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const secretRules = [
  ['openai-compatible-key', /\bsk-[A-Za-z0-9_-]{20,}\b/g],
  ['experiential-key', /\bxpl_[A-Za-z0-9_-]{20,}\b/g],
  ['codecraft-key', /\bcc_[A-Za-z0-9_-]{20,}\b/g],
  ['github-token', /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g],
  ['google-api-key', /\bAIza[0-9A-Za-z_-]{20,}\b/g],
  ['aws-access-key', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g],
  ['authorization-token', /\b(?:authorization\s*[:=]\s*Bearer|Bearer)\s+[A-Za-z0-9._~-]{20,}\b/gi],
  ['private-key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g],
  ['url-userinfo', /https?:\/\/[^\s/@:]+:[^\s/@]+@[^\s/]+/gi],
  ['sensitive-query', /[?&](?:api[_-]?key|access[_-]?token|auth|token|secret)=[^\s&#]{12,}/gi],
];

const personalPathRules = [
  ['windows-user-path', /\b[A-Za-z]:\\Users\\([^\\\s"'`]+)\\/g],
  ['posix-user-path', /(?:^|[\s"'`])\/(?:home|Users)\/([^/\s"'`]+)\//g],
];

function isClearlySynthetic(value) {
  return /(?:SECRET|PRIVATE|REDACTED|EXAMPLE|TEST|DUMMY|VALUE|TOKEN|xxxx|\*\*\*)/i.test(value);
}

function isExampleUrl(value) {
  return /(?:example\.(?:com|org|net)|\.example(?:\.com|\.test)?|\.internal\.example|\.test)(?:[/:?#]|$)/i.test(value);
}

function isPlaceholderUserInfoUrl(value) {
  const text = String(value || '');
  return /@(?:host|localhost|saldırgan|attacker|example|…|\.\.\.)(?:[/?#`'"\])\s]|$)/iu.test(text);
}

function isTestFixture(file, rule, value) {
  return file.startsWith('tests/')
    && ((rule === 'openai-compatible-key' && value.length < 40)
      || (rule === 'url-userinfo' && isExampleUrl(value)));
}

function isDocumentedPublicGoogleKey(file, rule) {
  return rule === 'google-api-key' && file === 'backend/youtube.py';
}

function summarizeFinding({ commit, file, line, rule, severity }) {
  return { commit: commit.slice(0, 12), file, line, rule, severity };
}

async function main() {
  const git = spawn('git', [
    'log', '--all', '--reverse', '--format=commit:%H', '--no-ext-diff',
    '--no-renames', '--unified=0', '--text', '--',
  ], { cwd: root, stdio: ['ignore', 'pipe', 'inherit'] });

  let commit = '';
  let file = '';
  let newLine = 0;
  let buffer = '';
  const findings = new Map();
  const pathWarnings = new Map();

  function inspectAddedLine(text) {
    if (!commit || !file || !text.startsWith('+') || text.startsWith('+++')) return;
    const content = text.slice(1);
    for (const [rule, regex] of secretRules) {
      regex.lastIndex = 0;
      for (const match of content.matchAll(regex)) {
        if (isClearlySynthetic(match[0]) || isExampleUrl(match[0]) || isExampleUrl(content)
          || (rule === 'url-userinfo' && isPlaceholderUserInfoUrl(match[0]))
          || isTestFixture(file, rule, match[0]) || isDocumentedPublicGoogleKey(file, rule)) continue;
        const finding = summarizeFinding({ commit, file, line: newLine, rule, severity: 'error' });
        findings.set(`${finding.commit}:${file}:${newLine}:${rule}`, finding);
      }
    }
    for (const [rule, regex] of personalPathRules) {
      regex.lastIndex = 0;
      for (const match of content.matchAll(regex)) {
        const user = String(match[1] || '');
        if (file.startsWith('tests/')
          || /^(?:\.{3}|user|username|name|home|tmp|test|example|example-user|redacted)$/i.test(user)) continue;
        const warning = summarizeFinding({ commit, file, line: newLine, rule, severity: 'warning' });
        pathWarnings.set(`${warning.commit}:${file}:${newLine}:${rule}`, warning);
      }
    }
  }

  function consume(line) {
    if (line.startsWith('commit:')) {
      commit = line.slice(7).trim();
      file = '';
      newLine = 0;
      return;
    }
    if (line.startsWith('+++ b/')) {
      file = line.slice(6).replace(/\\/g, '/');
      return;
    }
    const hunk = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunk) {
      newLine = Number(hunk[1]) || 0;
      return;
    }
    if (line.startsWith('+') && !line.startsWith('+++')) {
      inspectAddedLine(line);
      newLine += 1;
    } else if (!line.startsWith('-') && !line.startsWith('diff ') && !line.startsWith('index ')) {
      newLine += 1;
    }
  }

  git.stdout.setEncoding('utf8');
  git.stdout.on('data', (chunk) => {
    buffer += chunk;
    let index;
    while ((index = buffer.indexOf('\n')) >= 0) {
      consume(buffer.slice(0, index).replace(/\r$/, ''));
      buffer = buffer.slice(index + 1);
    }
  });

  const exitCode = await new Promise((resolve, reject) => {
    git.once('error', reject);
    git.once('close', resolve);
  });
  if (buffer) consume(buffer.replace(/\r$/, ''));
  if (exitCode !== 0) process.exit(exitCode || 1);

  const errors = [...findings.values()];
  const warnings = [...pathWarnings.values()];
  const report = {
    scanned: 'complete git history (all refs, added text lines)',
    secretFindings: errors,
    personalPathWarnings: warnings,
    note: 'Secret values are intentionally never printed.',
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (errors.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`Public history audit failed: ${error.message}`);
  process.exitCode = 1;
});
