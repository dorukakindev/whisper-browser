# Browser Bug Report 60 — independent check of Report 59

Date: 2026-09-18. Audited tree: `master` at `58da7cd971d6be87e4b84c35dbec52a8d2009cdd`. This is a read-only product-code review of the repair summary in Report 59, not a new audit of every claim in Report 54.

## Verified

- The reported code commit `137d5e5` exists locally and changes the 15 named repair areas with accompanying tests. The documentation commit `58da7cd` exists locally. The working tree was clean before this report.
- All eight targeted JavaScript test files for the new repairs passed when invoked separately: `browser-live-audio`, `browser-lifecycle-policy`, `browser-cea-captions`, `browser-cea-full-capture`, `browser-foundation`, `adversarial-ipc`, `queue-lifecycle`, and `player-ui`.
- `backend/venv/Scripts/python.exe backend/test_transcribe.py` passed 190/190.
- This does **not** prove live Electron crash, live HLS, real WhisperX, or AltGr/rich-editor behavior; Report 59 correctly leaves those as non-synthetic acceptance limits.

## Confirmed remaining defect: R58-14 is not fully closed

`backend/transcribe.py:7766-7787` sorts the piecewise-aligned cues and shortens each end to `max(start + 0.01, next_start - min_gap)`. If two transformed cues have the **same start**, the minimum-duration floor defeats the no-overlap rule. The algorithm also compresses an originally multi-second cue to 10 ms, making it effectively unreadable. The new test at `backend/test_transcribe.py:581-591` covers a reversed but *unequal-start* pair, so it misses this boundary.

Deterministic reproduction against current code:

```powershell
& 'backend/venv/Scripts/python.exe' -c "import sys; sys.path.insert(0,'backend'); import transcribe as t; print(t.apply_piecewise([(0,2,'first'),(2,4,'second')],[(0,0,2),(1,1,0)]))"
```

Observed: `[(2.0, 2.01, 'first'), (2.0, 4.0, 'second')]`. The second cue starts before the first ends. Two adjacent source cues with opposing piece offsets can produce this input; it requires no provider, site, or user data.

Acceptance: add an equal-start/opposing-offset regression; preserve source text order and a readable cue duration where possible. If the piecewise mapping cannot satisfy chronological order, positive duration and the minimum gap simultaneously, reject that piecewise candidate or fall back to a safer alignment with an explicit warning. Merely sorting and shrinking a cue to 10 ms does not close R58-14.

## Verification limits in this environment

`npm test` returned exit code 1 (10 failed test files). Several failures visibly stem from sandboxed child-process creation (`spawn EPERM` / `spawnSync ... python.exe EPERM`); the aggregate runner also reported Python unavailable although direct Python execution succeeded. This run cannot independently substantiate Report 59's full-suite-green claim, but these environment failures are not, by themselves, product regressions. A few tests report assertions after failed child processes. Re-run the full suite in the normal project environment before release.

`git ls-remote origin refs/heads/master` could not connect to GitHub from this environment. The remote-push equality claim therefore remains unverified in this independent check.
