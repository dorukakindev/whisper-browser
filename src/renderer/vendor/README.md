# Vendored browser assets

These third-party files are bundled locally because the renderer Content Security Policy disallows CDN scripts.

- hls.js 1.7.1 — Apache-2.0; see hls.js-LICENSE.txt
- PDF.js 6.3.289 — Apache-2.0; see pdfjs-LICENSE.txt

PDF.js modules, worker, fonts, character maps, WASM helpers, and color profiles support the local PDF reader.
- qrcode 1.5.4 — MIT; see qrcode-LICENSE.txt. `qrcode.js` is a pre-bundled browser build (global `QRCode`).
  The npm package is a **devDependency** only: its CLI pulls `yargs@15`/`yargs-parser@18`, which must not
  ship inside the packaged app. Rebuild after upgrading with
  `npx esbuild node_modules/qrcode/lib/browser.js --bundle --format=iife --global-name=QRCode --outfile=src/renderer/vendor/qrcode.js`.
