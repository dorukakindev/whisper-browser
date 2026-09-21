#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const packageRootArg = process.argv.find((arg) => arg.startsWith('--package-root='));
const packageRoot = packageRootArg ? path.resolve(packageRootArg.slice('--package-root='.length)) : null;
const nodeModules = packageRoot
  ? path.join(packageRoot, 'resources', 'app', 'node_modules')
  : path.join(root, 'node_modules');
const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
const allowed = /^(?:MIT|ISC|0BSD|BSD-[23]-Clause|Apache-2\.0|MPL-2\.0|CC0-1\.0|Python-2\.0)$/;

function licenseOf(pkg) {
  if (typeof pkg.license === 'string') return pkg.license;
  if (Array.isArray(pkg.licenses)) return pkg.licenses.map((row) => row?.type).filter(Boolean).join(' OR ');
  return '';
}

function packageDirs(base) {
  if (!fs.existsSync(base)) throw new Error(`node_modules not found: ${base}`);
  const result = [];
  for (const entry of fs.readdirSync(base, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === '.bin') continue;
    const first = path.join(base, entry.name);
    if (entry.name.startsWith('@')) {
      for (const scoped of fs.readdirSync(first, { withFileTypes: true })) {
        if (scoped.isDirectory()) result.push(path.join(first, scoped.name));
      }
    } else result.push(first);
  }
  for (const dir of [...result]) {
    const nested = path.join(dir, 'node_modules');
    if (fs.existsSync(nested)) result.push(...packageDirs(nested));
  }
  return result;
}

const rows = [];
if (packageRoot) {
  for (const dir of packageDirs(nodeModules)) {
    const file = path.join(dir, 'package.json');
    if (!fs.existsSync(file)) continue;
    const pkg = JSON.parse(fs.readFileSync(file, 'utf8'));
    rows.push({ name: pkg.name, version: pkg.version, license: licenseOf(pkg) });
  }
} else {
  for (const [key, value] of Object.entries(lock.packages || {})) {
    if (!key.startsWith('node_modules/') || value.dev === true) continue;
    const installed = path.join(root, key, 'package.json');
    const pkg = fs.existsSync(installed) ? JSON.parse(fs.readFileSync(installed, 'utf8')) : {};
    rows.push({ name: key.replace(/^node_modules\//, ''), version: value.version,
      license: value.license || licenseOf(pkg) });
  }
}
rows.sort((a, b) => a.name.localeCompare(b.name));
const failures = rows.filter((row) => !row.license || !allowed.test(row.license));
const lockCopyleft = Object.entries(lock.packages || {}).filter(([key, value]) => key
  && value.dev !== true && /(?:^|\s|\()(?:AGPL|GPL|LGPL)-/i.test(String(value.license || '')));

const result = {
  scope: packageRoot ? path.relative(root, packageRoot) : 'installed production dependency tree',
  packages: rows.length,
  licenses: [...new Set(rows.map((row) => row.license))].sort(),
  failures,
  productionLockCopyleft: lockCopyleft.map(([key, value]) => ({ package: key.replace(/^node_modules\//, ''), license: value.license })),
};
console.log(JSON.stringify(result, null, 2));
if (failures.length || lockCopyleft.length) process.exitCode = 1;
