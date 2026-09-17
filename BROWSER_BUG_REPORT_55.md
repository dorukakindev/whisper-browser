# BROWSER BUG REPORT 55 — Subtitle boundary and cue ownership repairs

**Date:** 2026-09-17

**Repository:** `dorukakindev/whisper-browser`

**Start product commit:** `54368c99644f15ef8020e51cc036760afd704f32`

## Scope and evidence

This report verifies the latest user-provided runtime log and the final 171-cue SRT produced by the application. The real subtitle text was used only for local measurement; no personal path, provider key, or subtitle corpus is copied into this report.

Three distinct defects were confirmed. Changes below repair those defects without changing cue IDs or rewriting unrelated subtitle lines.

## F-01 — Progressive Whisper windows lost boundary context

**Severity:** P1 for subtitle correctness

**Observed effect:** Long videos were processed as exact adjacent windows such as `[0,600]` and `[600,end]`. A word or sentence crossing the exact boundary could be split or lost. Refresh events then accumulated cues rather than atomically replacing the overlapping boundary region.

**Root cause:** `progressiveRanges` produced zero-overlap jobs. The progressive refresh branch inserted new cue keys into the existing map but did not retire stale cues in the refreshed interval.

**Fix:**

- Add a four-second bounded overlap between neighboring jobs.
- Use `replaceLiveCuesForRefresh` for each completed progressive range.
- Rebuild the translated cue map from the replacement result so stale overlap cues cannot accumulate.

**Rejection rationale:** Increasing only retry count or chunk size was rejected. Neither supplies the missing audio context at the exact cut, and both can increase cost without fixing the deterministic boundary defect.

**Verification:**

- `1306 s`: `[0,600]`, `[596,1306]`
- Current time `800 s`, duration `1800 s`: `[798,1398]`, `[1394,1800]`, `[0,802]`
- A synthetic stale pair at `596–602 s` is replaced by one complete refreshed sentence.
- `node tests/browser-youtube-whisper.test.js` passed.

## F-02 — Sentence validation allowed meaning to move to the next cue

**Severity:** P2

**Observed effect:** The whole translated sentence could contain all source meaning and still be temporally wrong: a target cue ended with a period before its source cue ended, while the remaining predicate appeared in the next cue. Whole-sentence equality alone could not detect this ownership error.

**Root cause:** Sentence protocol v2 validated count, complete reconstructed meaning, source echo, numbers, negation, names, and structural shape, but not premature target sentence endings at non-final cue boundaries.

**Fix:**

- Introduce `sentence_part_boundary_issue` and sentence protocol v3.
- Reject a target non-final cue ending in `.?!` when the matching source cue is still continuing.
- Apply the gate to exact/fuzzy cache acceptance, first provider reply, and refine reply.
- Add the same rule to both translation prompts so providers can correct the structure before a retry is consumed.

**Rejection rationale:** Comparing only the concatenated source and target sentences was rejected because it proves completeness, not the time interval to which each predicate belongs. A blanket ban on target punctuation was also rejected; legitimate source sentence endings remain allowed.

**Verification:** A deterministic three-cue fixture in which “drains vital energy” is ended one cue early is rejected atomically and publishes no partial translation. `backend/test_transcribe.py` passed `183/183`.

## F-03 — Rolling ASR hypotheses survived as duplicate high-CPS cues

**Severity:** P2 for readability, P3 for diagnostics

**Observed effect:** Consecutive Whisper hypotheses sometimes repeated a long middle/prefix run while extending or correcting the sentence. The final SRT retained both hypotheses, producing duplicate wording and extreme reading speed. The log also described the configured CPS value as a hard maximum even when the available speech interval made that impossible.

**Root cause:** Existing cleanup handled repeated prefixes but not the rolling-hypothesis shape where the second cue begins inside the first cue and extends it.

**Fix:**

- Add a conservative rolling-hypothesis reconciler before the existing cleanup stages.
- Require an adjacent interval, at least six shared words, strong overlap ratios, different text, and no speaker/SDH boundary.
- Preserve exact deliberate repetition and protected speaker/effect cues.
- Change the timing log from “maximum” to “target”, correct `KPS` to `CPS`, and emit an explicit warning when violations remain.

**Rejection rationale:** Global fuzzy deduplication was rejected because repeated dialogue is legitimate. Automatically stretching every short cue was rejected because it can overlap later speech and corrupt timing.

**Verification on the final real SRT:**

| Measure | Before | After |
|---|---:|---:|
| Cues | 171 | 169 |
| Rolling hypotheses reconciled | 0 | 2 |
| Fast-CPS warnings | 9 | 7 |
| Maximum measured CPS | 67.0 | 28.4 |

The remaining seven fast cues were deliberately not mutated without enough safe neighboring time. They are now reported honestly rather than described as already capped.

## Verification record

- `node --check src/renderer/renderer.js` — passed
- `backend/venv/Scripts/python.exe -m py_compile backend/transcribe.py backend/sentence_translation.py` — passed
- `node tests/browser-youtube-whisper.test.js` — passed
- `backend/venv/Scripts/python.exe backend/test_transcribe.py` — `183 passed, 0 failed`
- `npm run test:electron-bridge` — passed
- `npm test` — exit `0`, final line `Tüm testler geçti`
- `git diff --check` — passed; only Git's informational LF/CRLF notices were printed

## Limits

- No paid/live translation-provider request was made in this verification.
- No real Electron video playback acceptance run was performed in this turn.
- The actual final SRT was measured through the same pure cleanup and quality functions, but it is not committed to the repository.
- Seven remaining fast cues need either more source timing, word-level alignment, or manual review; this change does not conceal them.
