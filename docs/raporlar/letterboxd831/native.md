# R830 native full-review acceptance

Branch checked: `codex/letterboxd-full830`; starting HEAD `6d4c2d661257263f0f9414b2bdf8ba53f84513c9`. This owner edited **only** new `tests/electron-letterboxd-full830.smoke.js`. Parent owns all product changes. Adapted the existing electron-letterboxd-browser-collection native helper pattern; no new library, account, key, provider or external network.

## Result: PASS, native Windows exit 0

Accepted run: `tmp/letterboxd830/native-1793525092444/`, `evidence.json` and four unedited native screenshots. Ran primary installed Windows Electron through `Start-Process -WindowStyle Hidden -Wait`, with a fresh isolated test profile. Syntax and scoped diff-check passed. Expected adblock-download warning is the fixture's external-network refusal.

The actual media catalog IPC creates a controlled film; real review UI invokes normal automatic review collection. Direct HTTP receives a controlled403, causing the actual `createBrowserReviewReader` sandbox BrowserWindow fallback. Its persistent test partition intercepts only controlled Letterboxd documents: identifier redirect, film identity metadata, public activity review list, and exact `/s/full-text/viewing:123/` through129 routes.

Each of seven cards contains a short `collapsed-text` visible prefix, `data-full-text-url`, and `data-js-trigger="collapsible.expand"` More anchor. The production BrowserWindow path executes the new same-origin `fullTextFetchScript`, not a test replacement. Seven endpoint responses provide full paragraphs with unique source-specific end markers.

Verified:

- All **7 source texts are exactly 14,051 characters**, including the unique `UniqueEND830_123`…129 endings well beyond the former4000-character cutoff. No literal More survives.
- Native editor JSON preserves exact original text. JSON aggregate remains below120,000; all sources fit the new20,000 per-source bound.
- The loaded source reader DOM contains the complete long text and renders its end marker visibly. EN720 light and TR820 dark captures show the full-source tail in the existing bounded scroller without horizontal overflow.
- Authors, canonical authorIds, original review permalinks, source sort/page URL, dates and4/5 ratings survive expansion. One deliberately included spoiler-marked source retains `spoiler:true`; all others retain false. Spoilers were explicitly enabled in this controlled fixture before collection, rather than implicitly revealing excluded content.
- Exactly **7 browser continuation fetches** occur on the list and one direct Node request is denied. The owned collection BrowserWindow closes after reading and retains sandbox/contextIsolation true and nodeIntegration false.
- Keyboard Enter on the existing Preview action creates the real selection preview in both locales.
- All7 long rows remain selected; the analysis text budget shortens **7/7**. Preview explicitly reports shortening and each sent/original character count (about8262/14051). Reconstructed analysis context remains **≤64,000**. The editor's original end marker remains intact; analysis shortening does not overwrite loaded source text.
- No AI send button was activated and no provider configured/called. This is source extraction/transport/UI evidence, not live model quality or live Letterboxd access.

## Screenshots

In `native-1793525092444/`:

- `en-720-full-source-tail.png`: visible UniqueEND830_123 and original review attribution at source end.
- `tr-820-full-source-tail.png`: same long source in Turkish/dark controls.
- `en-720-shortened-preview.png`: explicit seven shortened sources and sent/original counts.
- `tr-820-shortened-preview.png`: Turkish shortening audit and source attribution.

Inspected EN source-tail and TR shortening captures directly; calm existing theme, text wrapping and bounded reader are preserved. No CSS product edit by this owner.

## Observation reported to parent

The initial fixture placed collapsed cards on both the identifier landing film page and the requested review-list page. All full texts reached the editor correctly, but the reader expanded them on both pages (14 continuation requests for7 sources). The film landing only needs identity for this automatic collection stage. Parent was notified of this redundant work; the accepted fixture uses a metadata-only landing so the test isolates7 requested list continuations. This observation is not presented as data loss or a failed full-text extraction. No product change was made by this test owner.

Limits: real renderer/preload/native IPC, sandbox BrowserWindow fetch and parser are exercised with controlled HTTPS documents. No public account/cookies, provider key, personal reviews, real remote site challenge, GPU, paid inference or all-page compatibility claim. No commits.

Final rerun on parent-stable code (metadata-only identity skip, max2 ordered full-text expansion, forwarded abort signal and tracked reviews-browser cancellation): **exit0**, same7 complete14,051-character sources and4 captures. These controlled fixtures do not establish success for the live45-second site probe; parent reports that live attempt timed out.
