# Open package — continuity remediation evidence

Date: 2026-11-01. Shared checkout `D:/Whisper Local/tmp/assistant618`, branch `codex/review-reading833`, baseline HEAD `2c1db1416d49b947dfcff8929a4f914a65bf14cd`. No commit/push by this agent. Other agents' concurrent edits were retained; this is an ownership matrix, not a claim about their validation.

## ID matrix

| ID | Status | Concrete change / evidence |
|---|---|---|
| R830-F01 | Fixed | Context playback synchronizes the intended group through generator `selectQuality`, revealing it when the quality filter excludes it. Full workspace+generator JSDOM click regression keeps Ready A selected and starts at 0.75 s instead of switching to Review B. |
| R830-F02 | Fixed | Global pronunciation proposals validate every persisted source+global merge before publishing config. 99 global + 1 local remains usable; adding an unrelated 100th global is rejected; an override remains valid. |
| R833-F01 | Fixed | Move buttons excluded from remove listener; real DOM move click and persisted order are `[2,1,3]`, preserving all jobs. |
| R833-F02 | Fixed | Queue-add click clears file/URL and emits success only after producer returns true. Both invalid file/URL selections survive, and correcting the range retries successfully. |
| R833-F03 | Fixed | Failed queue start releases `activeOutputJob` before all rejected/cancelled/busy branches. Controlled rejected start requires no nonexistent worker exit. |
| R833-F04 | Fixed in follow-up | Root authorized narrow main seam; per-origin+target maps now isolate guides. See open-package-library-features.md and new main regressions. |
| R833-F06 | Fixed | Rollback carries the exact stat returned by its own successful forward write. Intervening outside write is rejected and preserved; rollback failure surfaces existing warning. |
| R833-F07 | Fixed | Successful rollback calls `noteSubtitleStat`, permitting subsequent retry while keeping real external-edit conflict protection. |
| R833-F08 | Fixed | Every successful analysis replaces waveform/start/duration, including null waveform in a partial result. DOM listener regression verifies no old track data remains. |
| R833-F09 | Fixed, explicit partial playback policy | List >50 prompts in EN/TR before queue replacement, including total and selected count. Cancel preserves queue. Confirm chooses first50 deliberately. Full >50 continuation was not implemented; persisted list remains intact. This is the report's accepted explicit-partial-selection alternative. |
| R833-F10 | Fixed | Playlist enqueue, play, and queue shuffle refresh the existing home queue rail after persistence/button refresh. |
| R833-F11 | Fixed | Playlist paging measures unseen source IDs separately from visible cards. Fully filtered page2 retains More; page3 accessible, requests `[1,2,3]`. Duplicate/short/empty page termination remains. |
| R831-F01 | Fixed | `prepare()` ensures managed archive directory before caller's first savePage; fresh nested directory regression. |
| R831-F02 | Fixed | Missing selected subscription group resets to All. Real final-member delete reveals remaining ungrouped channel. Group-name clear uses same render validation. |
| R831-F03 | Fixed | CSV prefers canonical URL identity; bare UCID fallback must fill its own cell. Header-defined URL/name columns preserve identities and names, including a name equal to another complete UCID; bare fallback remains available. |
| R831-F04 | Fixed | Removal retains a temporary copy until index publication succeeds. Injected index rename EPERM restores original accessible archive and unchanged index; retry succeeds. Existing original-file unlink-failure contract retained. |
| R837-F01 | Fixed | Archive language normalization uses Intl.Locale, matching broader BCP47 profile acceptance. `zh-Hans-CN` and Turkish now save/find independent records. |
| R837-F02 | Fixed in follow-up | Root authorized main restore; shared site/path/tab precedence now applied. See library feature evidence. |
| R840-F05 | Fixed in follow-up | Root authorized trusted reader-state bridge; sender/token/generation/URL checks and current-state publication tested. See library feature evidence. |
| R835-F06 | Fixed | Comparison keeps source/normal cues wholly unmatched by speech, marks unmatched speech explicitly, preserves change/number filters; middle `500` passage visible. UI states unmatched count and each file's loaded time coverage, with explicit warning that missing script overlap alone does not prove missing audio. |
| R835-F07 | Fixed | Workspace groups retain allowlisted speechEditing.natural states, including editor_failed, through repeated projection. Unknown input state dropped; absent old metadata stays absent. |

R833-F05 is owned by the assistant/review agent and not counted here. No assigned ID was treated as historically already fixed: all locally owned roots were present in current checkout and corrected.

## Changed files owned by this agent

- `src/renderer/renderer.js`: narrow queue, subtitle rollback, SmartTube, subscription filter, waveform blocks only. Other agents separately changed research/assistant blocks.
- `src/browser-reading-list.js`: initial directory and index-failure rollback.
- `src/browser-translation-archive.js`: BCP47 normalization.
- `src/subscriptions-io.js`: semantic CSV identity priority.
- `src/dub-pronunciation-store.js`, `src/dub-service.js`: pre-publication global dictionary validation.
- `src/renderer/dub-workspace-ui.js`, `dub-generator-ui.js`: intended neighbor-listen selection.
- `src/renderer/dub-workspace-model.js`: bounded editing provenance persistence.
- `src/renderer/dub-experience-model.js`, `dub-experience-ui.js`: unmatched comparison passages and coverage.
- `tests/open-package-continuity.test.js`: 13 focused regressions against production functions/modules/DOM callbacks.

## Verification

Executed on Windows / Node v24.22.0. Relevant combined command:

```powershell
node --test --test-isolation=none tests/open-package-continuity.test.js tests/browser-reading-list.test.js tests/subscriptions-io.test.js tests/dub-pronunciation-store.test.js tests/dub-workspace.test.js tests/dub-workspace-ui.test.js tests/dub-experience801.test.js tests/browser-translation-archive.test.js
```

Result: **31 tests, 31 PASS, 0 FAIL, exit0** (4.78 seconds). Later direct-return-stat capture and bilingual coverage label adjustment: focused **13/13 PASS, exit0**. Final CSV header/name preservation refinement: new focused suite plus existing CSV tests **14/14 PASS, exit0**. These are current run results, not the historical report assertions. New regressions reuse only the historical pipeline fixture setup to execute current queue code; no old BUG assertions or historical PASS metadata are emitted.

All 12 owned JavaScript files passed node --check. Scoped git diff --check passed.

Not run: full npm suite, CI, start.bat/install.bat, native Electron UI/screenshots, real audio decode/listening, real provider/GPU/network, real browser account/profile. Controlled DOM and fs injection demonstrate specific boundaries; they do not establish full native visual/acoustic acceptance. No new dependencies, secrets, personal profile changes, or service/media-tools edits. Historical bug probes intentionally remain unchanged (they assert old broken behavior and are not pass criteria after remediation).

## Limits / residual policy

- R833-F09 retains the bounded queue and explicitly offers first50; this is not full-list continuation.
- Reading-list index failure now temporarily duplicates one archive on disk until publish succeeds. A secondary disk failure while restoring backup can still throw; the backup is retained for recovery rather than discarded.
- Comparison file coverage describes loaded cues, not acoustically verified speech; >5000 cues still show the existing truncation notice.
- Main integration follow-up is now implemented and documented in tmp/open-package-library-features.md; no main blocker remains.


