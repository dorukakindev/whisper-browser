# JASSUB 2.5.16 binary assets and notices

The bundled JavaScript, WASM, and font files are copied from the exact npm
distribution `jassub@2.5.16`:

- Tarball: https://registry.npmjs.org/jassub/-/jassub-2.5.16.tgz
- npm integrity: `sha512-n4vjXfraf3o8k3/5TK6DhCYVcbQ/VqhVOgwqLd3l0xfMtsN4fpE/hPq2hPaGagBTOtJS9yHwRoRp3mmchQ9XVg==`
- Source repository: https://github.com/ThaUnknown/jassub
- Upstream build instructions: https://github.com/ThaUnknown/jassub#how-to-build

Upstream's build instructions use `git clone --recursive` and its
`Makefile_licence` generates `dist/license/all` from the component sources.
The npm tarball does **not** contain `dist/license/all`, and no Git tag named
`v2.5.16` was available when checked on 2026-09-14. Consequently, the
component notices here are preserved from upstream source commit
`656371af1c904be59a1008dcdb93f18dfe5e23d0` and its submodule commits,
not represented as a byte-for-byte notice extraction from the npm release.

| File | Official source revision |
| --- | --- |
| `jassub-license_defaults.txt`, `jassub-license_fullnotice.txt` | [JASSUB source](https://github.com/ThaUnknown/jassub/tree/656371af1c904be59a1008dcdb93f18dfe5e23d0/build) |
| `libass-COPYING.txt` | [libass](https://github.com/libass/libass/blob/266b9831d7a7f513db48a02ade91c1f3e2fcd7a3/COPYING) |
| `fribidi-COPYING.txt` | [FriBidi](https://github.com/fribidi/fribidi/blob/247fddc3599e3fe7b1b5cc21020c9eb51e662637/COPYING) |
| `freetype-FTL.txt` | [FreeType](https://github.com/freetype/freetype/blob/801cd842e27c85cb1d5000f6397f382ffe295daa/docs/FTL.TXT) |
| `harfbuzz-COPYING.txt` | [HarfBuzz](https://github.com/harfbuzz/harfbuzz/blob/afcae83a064843d71d47624bc162e121cc56c08b/COPYING) |
| `brotli-LICENSE.txt` | [Brotli](https://github.com/google/brotli/blob/e61745a6b7add50d380cfd7d3883dd6c62fc2c71/LICENSE) |

The `jassub-license_fullnotice.txt` source contains the LGPL 2.1 license text
and common license notices. `jassub-license_defaults.txt` records the
upstream project-to-license mapping, including Expat. The `SOURCE-NOTICE.md`
and component texts remain in the repository when `tools/build-browser-ass.js`
refreshes generated assets. The notice set is evidence for this particular
vendor copy; it does not establish that every per-file attribution in the
compiled WASM has been recovered.
