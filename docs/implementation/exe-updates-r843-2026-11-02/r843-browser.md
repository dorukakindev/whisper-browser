# R843 browser handoff — 2026-11-02

Workspace `D:\Whisper Local\tmp\assistant618`, branch `codex/exe-updates-feeds`, starting HEAD `08e9e851`. No commit/push/Actions, personal profile, network or provider calls.

| ID | Result | Change |
|---|---|---|
| R843-10 | Fixed | `refreshBrowserUnloadProtection` now combines a fresh host check, frame/form/media runtime check and native audible measurement. An earlier unknown state recovers only when all three fresh measurements are known. Changed view/document generation rejects the check. Unload retains the initial and final complete checks; duplicate runtime-only probes removed. |
| R843-11 | Fixed | Reclaimer excludes stable protection reasons but does not exclude cached fields which unload refreshes. Thus formerly busy/audible/unknown/form states reach the fresh safety checks. Real host work, sound, forms and unknown states still prevent destruction. Maximum two attempts and single-flight behavior preserved. |
| K843-01 | Recoverable path fixed, original occurrence remains conditional | Native history API/argument/compatibility errors return false for the existing URL fallback. Aborted/cancelled/superseded errors, native network failures and unknown errors remain rejected. Caller rechecks ownership/current request/blank page before fallback; superseded errors cannot publish into a newer request. |

Changed files: `src/main.js` (only restore/unload/refresh functions), `src/browser-memory-control.js`, `src/browser-navigation-state.js`; NEW `tests/r843-browser.test.js`; one existing memory test assertion/title updated in `tests/four-browser-mechanisms.test.js`.

`browserHostWorkState`, its AssistantAgentUI/Recall busy probes, sourceUpdates registration and unrelated main integrations remain unchanged.

Observed checks:

- `node --test --test-isolation=none tests/r843-browser.test.js`: 3/3 PASS, 23ms process. Production refresh/restore functions extracted into isolated VM fixtures; real reclaimer/decision/history modules exercised. Includes host-timeout recovery, frame/native failures, current media/forms/drafts/jobs, stale flags, stable protections, two-attempt bound, recoverable native history fallback and cancellation/supersession/network-error non-replay.
- `node --test --test-isolation=none --test-name-pattern='memory reclaim' tests/four-browser-mechanisms.test.js`: 1/1 PASS, 29ms process. Candidate count 3→7 reflects that audio/video/form/host flags now require current unload checks rather than cached pre-exclusion.
- Syntax checks for `src/main.js`, `src/browser-memory-control.js`, `src/browser-navigation-state.js`: exit 0.
- Scoped `git diff --check`: exit 0 (only existing LF→CRLF informational warning).

Native expectation for root acceptance: in an isolated profile, retry an idle-tab unload after a temporary failed host measurement; keep real host/tab audio, active work and edited forms protected. K843 remains a controlled API-rejection-path regression, not a claim that native Electron corruption/compatibility failure was reproduced. No full suite, real OAuth, DRM, start.bat installation or live internet acceptance claimed. Original local report/probe files were read only and not copied/published.
