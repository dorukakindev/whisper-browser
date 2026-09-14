const path = require('node:path');
const fs = require('node:fs');
const esbuild = require('esbuild');
const root = path.resolve(__dirname, '..');
const out = path.join(root, 'src', 'renderer', 'vendor', 'browser-ass');
fs.mkdirSync(out, { recursive: true });
Promise.all(['jassub.js', 'worker/worker.js'].map(entry => esbuild.build({
  entryPoints: [path.join(root, 'node_modules/jassub/dist', entry)],
  outfile: path.join(out, entry === 'jassub.js' ? 'jassub.js' : 'worker.js'),
  bundle: true, format: 'esm', platform: 'browser', target: 'chrome120', minify: true,
  legalComments: 'external',
}))).then(() => {
  const pkgRoot = path.join(root, 'node_modules', 'jassub');
  const assets = {
    'dist/wasm/jassub-worker.wasm': 'jassub-worker.wasm',
    'dist/wasm/jassub-worker-modern.wasm': 'jassub-worker-modern.wasm',
    'dist/default.woff2': 'default.woff2',
    LICENSE: 'JASSUB-LICENSE.txt',
  };
  for (const [source, target] of Object.entries(assets)) {
    fs.copyFileSync(path.join(pkgRoot, source), path.join(out, target));
  }
  const pkg = JSON.parse(fs.readFileSync(path.join(pkgRoot, 'package.json'), 'utf8'));
  const notices = path.join(out, 'third-party-licenses');
  for (const name of ['SOURCE-NOTICE.md', 'jassub-license_defaults.txt', 'jassub-license_fullnotice.txt',
    'libass-COPYING.txt', 'fribidi-COPYING.txt', 'freetype-FTL.txt',
    'harfbuzz-COPYING.txt', 'brotli-LICENSE.txt']) {
    if (!fs.existsSync(path.join(notices, name))) throw new Error(`ASS üçüncü taraf lisans bildirimi eksik: ${name}`);
  }
  fs.writeFileSync(path.join(out, 'LICENSES.txt'), [
    `JASSUB ${pkg.version} dağıtım lisans kaydı`, '',
    'Paketin package.json içinde bildirdiği SPDX ifadesi:', pkg.license, '',
    'JASSUB paketinin sağladığı üst düzey lisans JASSUB-LICENSE.txt içinde korunur.',
    'Bundled worker/WASM/font bileşenleri yalnız MIT kapsamında değildir.',
    'Üçüncü taraf metinler ve kesin kaynak kimlikleri third-party-licenses/ dizinindedir.',
    `Upstream kaynak: ${pkg.homepage}`, '',
  ].join('\n'));
}).catch(error => { console.error(error); process.exitCode = 1; });
