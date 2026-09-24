# BROWSER_BUG_REPORT_120 — catalog/master integration regressions

Date: 2026-09-24. Base: `origin/master` at `634b772e9e91eb7f25fbac9390477fecdc8510ca`; incoming branch: `codex/catalog-sync` at `3336734ac37f2fbed46b5ee9fb689487d5a5c426`.

## Confirmed findings and fixes

- The newly combined English locale table had 19 duplicate Turkish keys. The R117 locale regression failed (`1694 !== 1713`); duplicate entries were removed without dropping any distinct key. The period-terminated YouTube browser signal was also missing its exact English entry. The R117 and i18n coverage checks now pass.
- The sentence-level proper-name gate treated the modal in `Can I come too?` as the name “Can”. It rejected the correct `Ben de gelebilir miyim?` three times and left the English source in the result. The gate now excludes only modal `Can` followed by a pronoun; a near-miss change to the actual name in `Can arrived early.` is still rejected. The formerly failing one-based reply recovery test and the new modal/name regression both pass.
- The independent CSS color ratchet was 508 against its existing limit of 470 after combining the two branches. The fixed dark video-control colors were moved to scoped CSS custom properties with the same values; the limit was **not** increased. It now reads 470/470.

## Evidence and limits

No tracked user profile or credential files were touched. The merge was performed in an isolated worktree. Selected browser/player/TV/translation Node tests, 37 sentence-distribution tests, 11 translation-audit tests, 8 SDH tests, syntax compilation, and the real Electron trusted-bridge smoke passed. `npm test` and live YouTube/paid-provider acceptance were intentionally not run. Node's multi-file `--test` launcher hit sandbox `spawn EPERM`; the same relevant files were run directly and passed.
