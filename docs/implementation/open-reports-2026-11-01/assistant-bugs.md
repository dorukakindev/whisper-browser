# Open package assistant/source corrections — 2026-11-01

Worktree: `D:\Whisper Local\tmp\assistant618`; baseline branch `codex/review-reading833`, HEAD `2c1db1416d49b947dfcff8929a4f914a65bf14cd`. Existing CSS/manifest edits belong to other work and were left alone. No commit/push; parent integrates.

| ID | Current result | Mechanism / evidence |
| --- | --- | --- |
| R830-01 / R815-B98 | Fixed, focused regression passed | Research passage responses no longer fall back to unremapped local W text when all URLs are outside the 10-source session budget. Synthesis-only fallback requires all its sources to be admitted. Existing unchanged B98 test reproduced FAIL before fix and PASS afterward. |
| R835 F01 | Fixed, controlled renderer/store/native snapshot checked | Persist bounded `pageEvidence` separately from timed subtitle evidence, including paragraph ID/text and original tab/URL/generation. Restore legacy renderer paragraphs and publish managed/native links. First published answer and disk-recreated workspace preserve S1. Citation command reveals original revision; changed generation is blocked. |
| R835 F02 | Fixed, producer/service/UI checked | Book IDs use actual retrieved excerpt offset, rather than original chunk start. Two queries on the same page produce distinct B IDs; service → UI → cleanThread preserves both RED/BLUE excerpts. Existing sourceId/page navigation ownership remains. |
| R833 F05 | Fixed, actual store disk reload checked | Note-only saves pass accepted links/tags unchanged. Editing links recognizes the label delimiter before an HTTP(S) URL without splitting literal pipes inside URLs. Invalid edited URL aborts save, retaining draft and disk content. Five controls cover literal/encoded pipe, label pipe, ordinary URL, and comma-containing tag. |
| R840 F04 | Fixed, actual translation producer request checked | Translation payload carries canonical caller scene index, calculated with bisect on sorted canonical scene boundaries. Role reader uses supplied scene index; legacy callers retain their previous fallback. Custom 2s gap and EXT marker yield [0,1]; safe default gap yields [0,0]. Controlled model only. |

## Product files changed

- `src/assistant-agent-service.js`
- `src/assistant-thread-store.js`
- `src/renderer/assistant-book-search.js`
- `src/renderer/assistant-workspace.js`
- `src/renderer/global-assistant.js`
- `src/renderer/renderer.js` — research editor/save; captured page source metadata and restored citation revision guard only.
- `backend/transcribe.py` — canonical scene index in sentence group payload only, plus stdlib bisect import.
- `backend/speech_relations.py`

## Focused regression artifacts

- `tests/open-package-assistant-citations.cjs` — actual renderer/agent service/UI, actual thread-store disk/reload and native snapshot; first answer, restored link, stale-generation guard, two book excerpt identities.
- `tests/open-package-research-note.cjs` — actual main extracted handlers + note store/disk + renderer; five URL/tag controls, invalid link prevents overwrite. Uses synthetic temp profile only.
- `tests/open-package-scene-roles.py` — actual llm_translate and source-role batching, controlled provider transport; custom gap, EXT marker, safe gap.

## Commands/results

- `node --test --test-isolation=none --test-name-pattern='B98:' tests/report815-assistant-regressions.test.js` — 1 PASS after observed 1 FAIL before.
- `node tests/open-package-assistant-citations.cjs` — PASS.
- `node tests/open-package-research-note.cjs` — PASS, 5 disk round trips plus invalid-save checks.
- `python tests/open-package-scene-roles.py` — PASS, [0,1]/[0,0]/[0,1], no warnings.
- `node --test --test-isolation=none tests/assistant-threads.test.js tests/assistant-workspace-ownership200.test.js tests/assistant-book-actions.test.js` — 18 PASS.
- JavaScript syntax checks on all six changed JS files and Python py_compile on both backend files — PASS.
- `git diff --check` limited to owned product files — PASS.
- Default Node test child isolation initially failed with sandbox `spawn EPERM`; using documented supported Node isolation=none completed all 18 tests. No test expectation was weakened.

## Boundaries

No native visual/keyboard/window acceptance, real PDF reader navigation, real web site, paid provider, model quality, GPU, start.bat/install.bat or full-suite/CI validation. Page evidence survives reload as an excerpt; reopening a different tab/generation deliberately does not jump into a possibly unrelated S1. No personal profile, open app, media, key, or settings used/stopped. No third-party code or dependency added. Historical audit probes were not changed or counted as repaired merely because their bad-behavior assertions passed. B63 remains outside this work. Research/library enhancements and other open reports remain parent-owned.

Additional backend verification: the existing `test_speech_relations.py` cases matching `scene_boundaries`, `source_only_bounded_batches`, and `boundary_context_cannot` each pass (3 focused cases). A broader optional module run stopped progressing after four dots; it was interrupted as an owned test subprocess. A retry with time.sleep mocked also stalled and was interrupted. No failure assertion was observed and no module-wide success is claimed; cause is uninvestigated/outside the focused scene fix. No user app/process was stopped.
