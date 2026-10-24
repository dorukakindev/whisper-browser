# Defuddle browser extraction

Unmodified `dist/index.js` from the official npm package `defuddle@0.19.5`.
Source: https://github.com/kepano/defuddle (MIT; full license in LICENSE).
Package: https://registry.npmjs.org/defuddle/-/defuddle-0.19.5.tgz
SHA256 of defuddle.js: `9111f51a2ba7289c0586d00b04234af46fb23dab5db7ad3b837b615ed8d2f922`.
Bundled MathML converter notice: MATHML-TO-LATEX-LICENSE.md, from the official
`mathml-to-latex@1.8.0` npm package (upstream dependency declared `^1.8.0`).

Used only in the browser reader's trusted isolated world, synchronously on an
inert document clone, with async extraction disabled. Result HTML is passed
through the existing tag/attribute/URL allowlist copier; never inserted live.
Small/failed/oversized extraction falls back to the existing bounded extractor.
No npm runtime dependency, CDN, model, API key or install script is introduced.
