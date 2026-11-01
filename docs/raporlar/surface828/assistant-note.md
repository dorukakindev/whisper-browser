# Assistant surface craft — R828

Scope: `src/renderer/assistant-overlay.css` and `tests/electron-assistant-design-tour.smoke.js` only. Branch `codex/surface-craft828`, base `12ace3e57fe440491d6dbcb371b4b06e33cc99d7`. No commits, shared palette/fonts/motion/JS/API changes. Existing OFFLINE-MANIFEST/.codex changes predate this work.

## Evidence and spatial thesis before implementation

Read AGENTS.md, DESIGN.md, model preference, frontend-design, frontend-design-premium ownership/verification references, impeccable layout/craft-floor. Parent already loaded context launcher; not repeated. Reviewed R827 actual `docs/raporlar/theme827/after/assistant-narrow.png` and fresh isolated native before captures.

Primary path: context/source → conversation → answer/evidence → deliberate decision → draft/send. Answer prose is the reading column. Source and thread remain compact context; tool title, evidence and decisions belong together. Long evidence scrolls within a bound, without folding decisions into that scroll. Composer remains a separate flex row. Normal paragraph/list/heading rhythm replaces blank-line-plus-paragraph spacing. At 360px decisions wrap and user-message chrome uses less width/height; no controls removed or forced all-content-visible state.

Native finding: renderer creates a `<br>` for every markdown blank line, while paragraphs already carry margins. The two mechanisms compound, leaving about a line of wasted space between headings and prose. User bubble padding/action spacing leaves only the assistant role at the bottom of the initial 360×600 conversation. Source-card excerpts were unbounded; tool buttons used independent margins, making wrapping inconsistent.

## Implementation

- Hide only direct markdown break nodes, retain semantic paragraphs and their spacing; tighter list rhythm and heading/prose grouping.
- User bubble uses natural content width and right alignment with a 16px minimum inset; 12px padding; actions use one 4px/8px rhythm.
- Tool card is a wrapping flex group: title/explanation occupy a row, decisions wrap within the card, receipts retain their separate bounded scroll. Long source excerpt/translation receive 144px/112px bounds.
- Composer command row gets a quiet structural seam using existing border token.
- Test tour adds long question + long source/tool evidence, paragraph-gap assertion, nested-scroll/decision hit testing, and title/tail captures. Streaming fixture now supplies genuinely long initial content: after removing artificial whitespace the former short fixture was within the existing 60px follow-tail threshold, so it no longer represented reading earlier text. No production scroll logic changed and assertion was retained.

## Verification and reviewed artifacts

- Native before: 24 states passed, `.uiprev/assistant-design-tour/1793518779263-before`.
- Final native after: 32 states passed, `.uiprev/assistant-design-tour/1793518960111-after`; 360×600 and 480×720; TR/EN; dark/light; empty, source disclosure, conversation, long code, streaming/draft, conversation menu, long question, evidence/tool cards. Zero provider calls, synthetic sources, separate profiles.
- Existing native review824: 5 states passed, `.uiprev/assistant-review824/1793518914974`; review confirm/cancel reachable, review opens without dispatch, cancel focus restored.
- `node --test --test-isolation=none tests/assistant-short-panel825.test.js tests/assistant-overlay.test.js tests/assistant-resilience-ui.test.js`: 9/9 passed. Default subprocess test execution was blocked by sandbox `spawn EPERM`; non-isolated execution passed.
- `node --check tests/electron-assistant-design-tour.smoke.js`; `git diff --check`: passed (Git line-ending advisory only).
- Impeccable layout detector before/after: `[]`.
- Premium strict static audit started with the real repository root, produced no output for multiple minutes, then was interrupted. It is incomplete; no static premium-compliance claim. No broad product test/build run for this CSS-only scope.

Personally inspected native PNGs: baseline360 conversation; after480 dark conversation; after360 light conversation; after360 dark streaming long draft; after360 dark tool header and card tail; after480 light tool tail; after360 dark review. The header/prose gap is now compact and the streaming panel shows the full first paragraph above the composer. Initial360 conversation now reveals the assistant heading, though most of the answer still requires conversation scrolling. Long tool content still needs its bounded scroll, and card title/tail are separate viewport positions; not all content is visible at once. Copy of selected before/after PNGs/results/measurements: `tmp/surface828/assistant-evidence/`.

## Limits

Native tests required sandbox escalation after Electron IPC access-denied at the first normal launch; approved isolated launches passed. These renderer fixtures do not establish live provider quality, main-app docking, native select popup geometry, DPI/200% zoom, all five surfaces, or start.bat/backend/GPU behavior. No user app/profile was closed or changed. Existing activity motion was checked by the tour but not edited. No external project implementation was imported; using existing native flex/disclosure/scroll ownership was sufficient for this bounded refinement.
