# Open package — library / Letterboxd fixes

## Final collision correction

Final review found that a parallel feature agent had reused `tests/open-package-library.test.js`, replacing this slice's original eight bug regressions. Root separated that feature suite as `tests/open-package-library-features.test.js`. This slice's eight original ID regressions were restored from the session into **`tests/open-package-library-bugs.test.js`**, without touching the feature file or product code.

Current post-restoration verification: `node --test --test-isolation=none tests/open-package-library-bugs.test.js` — **8/8 pass**, covering F835-03/04/05, F837-03/04 and F840-01/02/03. Only these eight were rerun at final collision correction. The earlier93/93 and other checks below are historical results from before the filename collision; they are **not a claim that the final current93-test combination was rerun**. References below to the old `tests/open-package-library.test.js` name describe that earlier run; the delivered bug test file is now `tests/open-package-library-bugs.test.js`.

2026-11-01. Work only in `D:\Whisper Local\tmp\assistant618`; no commit/push, primary profile, personal application shutdown or live service calls.

Read AGENTS.md, DESIGN.md, current handoff index, YENI-BILGISAYAR.md, R835/R837/R840 exact findings and linked film/spec probes. R815 remediation README/status remains historical: 133 fixed / B63 mitigated-open; old R815 was not reopened.

| ID | Current-code reproduction and verified change |
| --- | --- |
| F835-03 | Existing historical spoiler gate worked with source spoilers off, but selecting spoiler source reviews bypassed history consent. History now requires its own explicit reveal regardless of that checkbox. Both the existing default-off workflow test and new checkbox-on DOM regression pass. |
| F835-04 | Library returned the old reaction while Discover returned the newer one. Positively provider-linked records now use newest timestamp, with local ties; unbound legacy feedback stays local. No stored record is deleted or overwritten by reading. |
| F835-05 | Rejected same-author row poisoned text/permalink dedup and excluded next-page author B. Dedup/author sets now update only after all acceptance gates, including requested count, pass. |
| F837-03 | Original-title CSV row lost metadata and current personal rating in taste.profile. Profile lookup now indexes title and originalTitle, rejects alias ambiguity and excludes series. |
| F837-04 | Two watches of one film yielded count 2 / emerging support. Distinct matched films now determine rating distribution, average, genre/director support and favorites. Current personal rating wins; otherwise latest dated rating wins with export order breaking ties. Diary/month event counts are preserved as `watchEvents`; policy is explained in EN/TR profile copy. |
| F840-01 | Both all-incomplete and mixed samples with full-text HTTP403 missed normal Browser fallback. Expander now preserves a bounded blocked count separately from other incomplete failures. Automatic collection carries the HTTP403 classification into existing fallback while excluding teasers. |
| F840-02 | Public fetch returned matched old film after awaited continuation and catalog change. The handler now captures an immutable identity snapshot, re-reads current item after full parsing, checks cancellation and refuses changed identities. |
| F840-03 | A comment's movie999 link overrode film movie123 metadata in raw parser and browser extraction. Both now exclude article/li/review-body links. Exact HTTPS TMDB hosts/paths are validated; explicit film IDs take priority. Conflicting metadata yields unverified, while definitive film/year/provider mismatches remain mismatch. |

All eight new focused regressions failed before implementation. F835-03 initially exposed a test-fixture issue (the real MediaToolsUI replaces the supplied stub); corrected to call the production review mount with a real checkbox-on draft and confirmed the actual spoiler leak before the fix.

Changed files:

- `src/letterboxd-auto.js`
- `src/letterboxd-reviews.js`
- `src/media-tools-service.js` (root notified before narrow reviews-fetch / decision-get edits)
- `src/media-taste.js`
- `src/renderer/review-decision-ui.js`
- `src/renderer/media-taste-ui.js` (policy copy only)
- `tests/open-package-library.test.js`

Verification:

1. `node --test --test-isolation=none tests/open-package-library.test.js tests/letterboxd-reviews.test.js tests/letterboxd-auto.test.js tests/letterboxd-sampling-critical.test.js tests/letterboxd-browser-reader.test.js tests/letterboxd-full-text.test.js tests/letterboxd-browser-fallback.test.js tests/media-taste.test.js tests/taste-quiz-flow.test.js tests/letterboxd-review-profile.test.js` — **93/93 pass**.
2. `node --test --test-isolation=none tests/review-workflow.test.js tests/media-shelf-service.test.js` — **38 pass / 1 environment failure**, Python discovery blocked under sandbox. This includes all **36 review-workflow checks passing** (fulltext, source/count/sampling/advanced disclosures, explicit spoiler gate, late requests, save/analysis).
3. Retried `tests/media-shelf-service.test.js` outside subprocess sandbox with `WHISPER_TEST_PYTHON=C:\Users\K\AppData\Local\Python\pythoncore-3.14-64\python.exe` — **3/3 pass**, including real Python importer, shared catalog and preserved personal scores. The initial discovery failure was not a product failure and was not suppressed by modifying tests.
4. `node --check` on six changed production JS files and new test; focused `git diff --check` — pass (normal CRLF warning for taste UI only).

No new dependencies. Existing full source text, spoiler defaults, 1–48 count controls, balanced provenance, save/analysis bounds and advanced settings retained. Tests run on Windows with controlled network / JSDOM and isolated temporary stores. Live Letterboxd/Cloudflare frequency, native UI appearance/DPI, normal start.bat, provider quality and full CI were not claimed. Native visual verification of the extra explanatory profile copy remains a delivery limitation; no layout or theme was changed.
