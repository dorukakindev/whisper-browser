# BROWSER_BUG_REPORT_88 — SmartTube test failures triage (2026-09-20)

Scope: read-only diagnosis of the two failing assertions in
`tests/report67-smarttube-wiring.test.js` at repository commit
`74d17f6870fe1cb6d5cff7026015663e9c4b164d`. No product or test code changed.

| Test | Verdict | Evidence |
| --- | --- | --- |
| `renderer: kart kanal linki oynatmayı tetiklemez (stopPropagation)` | Test false positive, not a demonstrated product defect | `src/renderer/renderer.js` `buildSmartTubeCard` defines `goChannel` with `e.stopPropagation()` and `e.preventDefault()` before opening the channel. The test extracts the function with `/return card;\n}/`, but this Windows checkout has `return card;\r\n}`; extraction fails before checking behavior. |
| `R68 Y3: arama input'u debounce'lu canlı sorgu yapar` | Test false positive, not a demonstrated product defect | The `input` handler clears the previous timer, resets on empty input, and schedules `doSmartTubeSearch()` after 450 ms if the query is unchanged. The test regex permits only 80 characters between `setTimeout(` and `450)`; current harmless query guard makes that span 93 characters. |

These source-contract failures do not prove actual click/keyboard or timed-input
behavior in Electron. Follow-up: replace fragile source-string assertions with
behavior tests. Dispatch a bubbled click/Enter on the channel button and assert
the card open handler is not called; use a fake clock for debounce, cancellation,
and empty-query reset. Keep the behavioral expectations strict.

Verification: `node tests/browser-report86-regressions.test.js` passed 44/44 on
this Windows host; `npm test` exited 1 (one failing file); the report67 test
passed 64/66. Static byte check confirmed `return card;\r\n}`, the
`stopPropagation()` call, and the 93-character timeout span with a 450 ms delay.
No Electron UI run was performed. Existing untracked files were not changed.

## Follow-up (2026-09-20) — RESOLVED

Both assertions were rewritten as strict behavior tests per the recommendation
above; the same product contract is now verified by dispatching real events
instead of matching source text:

- `renderer: kart kanal linki oynatmayı tetiklemez (davranış)` — evaluates
  `buildSmartTubeCard` in a `vm` sandbox over a minimal bubbling DOM. Channel
  click and Enter must call `openInvidiousChannelPage(authorId)` without firing
  the card's `open()` (probe/hide spies stay at 0); arrow keys must still bubble
  for grid navigation; card click and Space must trigger playback.
- `R68 Y3: arama input'u debounce'lu canlı sorgu yapar (davranış, sahte saat)` —
  wires the extracted `if (searchInp)` listener block to a fake input with a fake
  clock: no query before 450 ms; retyping cancels the pending timer; the stale-
  query guard drops a timer whose input changed; empty input resets without a
  query; Enter fires immediately and cancels the pending timer.

Result: `node tests/report67-smarttube-wiring.test.js` 66/66 on Linux; the suite
is now line-ending-agnostic (extractions use `\s*`/anchored spans, not `\n`
byte-exact tails). `npm test` on this host: 1 failing file remaining —
`watch-index-assets.test.js`, the documented `node:sqlite` fts5 environment
limit on this Linux build (Node 22.14.0). Product contract unchanged; the
Windows-only failures in this report were test-harness artifacts, confirmed.
