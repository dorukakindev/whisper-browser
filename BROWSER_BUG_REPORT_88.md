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
