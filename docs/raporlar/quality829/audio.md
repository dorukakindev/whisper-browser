# R829 audio hardening — Q03/Q04/Q06

Shared branch `codex/dub-assistant-quality829`, base `d78242ead655c3257b2139d3b5690d7d15c63e26`. No commits. This additional scope was explicitly assigned by parent after speech work. Read existing implementation/tests and related registry families F21 N0401–N0420, F23 N0441–N0460, F24 N0461–N0480, F25 N0481–N0500. Historical checks are not new discoveries; no bulk rerun.

| Target | Disposition and concrete gap | Change and evidence |
|---|---|---|
| Q03 group level/pace continuity | Enhanced. Existing continuity measured adjacent files but used whole-job median and compared adjacent list rows across long source silence; packed previews hide those original gaps. `zip(paths,texts)` also silently shortened diagnostics on count mismatch. | `tools/voxcpm2/dub_continuity.py:prepare` accepts source groups, computes per-scene medians in linear grouping work, and excludes cross-scene neighbors/warnings. Source gaps >=8000ms or explicit speaker changes reset the comparison. Packed previews use original `source_start/source_end`. Mismatched audio/text/group counts and invalid group ranges fail before measuring/rendering. Existing conservative ±2dB limit/raw cache ownership remains. `backend/test_dub_continuity801.py` 5/5 passed: source-preview scene split, same-scene +2dB correction, speaker split, count/range rejection, raw-byte/frame/cache checks, timeline ownership and silence/unavailable behavior. |
| Q04 punctuation/breath pauses | Enhanced. Existing punctuation join added only missing silence and preserved breaths; Unicode ellipsis `…` incorrectly fell through to generic 80ms although ASCII `...` received sentence 220ms. Whitespace interspersed with closing quotes also hid punctuation. | `tools/voxcpm2/dub_finish.py:join_pause_frames` recognizes Unicode ellipsis and strips closing quotes/brackets plus whitespace as one trailing sequence (includes CJK closing quotes). Added focused equivalent `…`/`...`/quotes tests, existing breath >=300ms unchanged, comma 120ms/general 80ms unchanged, no overlap/tempo manipulation. `tests/test_dub_finish.py` 24/24 passed. |
| Q06 reference quality guidance | Enhanced. Existing stereo mean happened before clipping/quality measurement, concealing clipped source channels and opposite-polarity cancellation. | `tools/voxcpm2/dub_quality.py:reference_quality` measures source channels before mono downmix. `clipping_fraction` is now worst source-channel clipped fraction. New `channels`, `source_peak`, `source_rms`, `channel_rms`, `channel_clipping_fraction`, `downmix_loss_db` identify what was measured. New warning `downmix-cancellation` when multi-channel source RMS >=0.01 loses >12dB on averaging. Actual downmixed `rms`/silence/window fields remain. Controlled clipped-left/silent-right test would have hidden clipping before; opposite-polarity tone test would have appeared merely silent. Same-phase stereo/mono retain clean warnings. `tests/test_dub_quality.py` 17/17 passed, including existing semantic quantity/negation/cache checks. |

## Parent integration interface

`prepare(paths, texts, *, enabled=False, directory=None, groups=None, scene_gap_ms=8000)`

- Pass `groups=groups` from `altyazi_oku.py` (owned by parent; this agent did not edit it).
- Group dictionaries use dub-plan milliseconds `start/end`; preview dictionaries may supply original `source_start/source_end`. One group per path/text is required. No automatic semantic scene classifier is claimed. Explicit optional `speaker` strings isolate speaker changes when both neighbors have labels.
- Parent maps new `downmix-cancellation` reference warning in existing EN/TR reference guidance UI. No UI edits in this agent scope.
- Source `clipping_fraction` previously measured mono average; it now deliberately reports worst source channel. New per-channel fields explain this value. Existing downmixed `rms` still describes the audio that averaging produces.

## Files / verification

Product: `tools/voxcpm2/dub_continuity.py`, `dub_finish.py`, `dub_quality.py`.
Tests: `backend/test_dub_continuity801.py`, `tests/test_dub_finish.py`, `tests/test_dub_quality.py`.

Commands used approved native environment `D:/Whisper Local/backend/venv/Scripts/python.exe`, avoiding the previously diagnosed restrictive sandbox tempfile loop:

- `-m unittest discover -s backend -p test_dub_continuity801.py`: 5 passed, exit0.
- `-m unittest discover -s tests -p test_dub_quality.py`: 17 passed, exit0.
- `-m unittest discover -s tests -p test_dub_finish.py`: 24 passed, exit0.
- `-m py_compile` all six changed files; `git diff --check`: exit0.

No package/dependency/external source copied, no raw cache changed in-place, no personalized recordings/keys/profiles. Measurements and synthetic fixtures do not establish human speech naturalness, a real GPU result, music/noise/VAD/speaker classification, or a preferred mood/voice. Reference guide flags channel mixing evidence, not an automatic diagnosis of its physical cause. Parent owns final generator/UI wiring and integration verification; full CI not rerun by this agent.
