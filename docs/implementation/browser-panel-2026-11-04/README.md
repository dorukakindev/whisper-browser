# Approved browser subtitle panel — 2026-11-04

Product commit: `f80647fa392803f053313aea0997c637cf466f35`. Branch: `codex/library-film-motion-preview`.

## Delivered

- Grouped subtitle toolbar, five-track preview/expanded picker, panel header and tabs, sentence-flow tools, footer assistant action and narrow-window overlay.
- Five searchable tool groups with distinct icons, accessible labels, highlighted matches, empty search state, disabled ASS explanation and panel-only configurable sentence keys.
- Pinned task display (two jobs plus a count), original cancellation handlers, context-scoped result toasts. Unknown totals use indeterminate progress.
- Approved subtitle action list with edit access; approved sync form reusing original reference/preview/alignment controls. The offset proxy invokes the existing input handler and does not maintain a second persisted value.
- Subtitle results use selectable rows and one Apply button. The existing download/open path receives the selected record; stale media context is rejected. No placeholder records ship.
- Original control IDs, outer nodes and listeners survive layout moves and the return to local-player mode.

## Validation

- Existing tests: `node --test --test-isolation=none tests/browser-subtitle-menu.test.js tests/browser-subtitle-actions.test.js tests/browser-subtitle-selection.test.js`: 3/3 passed. Syntax and diff whitespace checks passed.
- Isolated Windows Electron: approved action/sync/results screens captured at CSS widths 1440, 1920 and 940 (DPR1.5). Controlled result selection sent record102 rather than101; one Apply action; original controls unique; one form/range/edit action after mode roundtrip.
- Offset with no loaded track was correctly rejected by the original handler; proxy and source both reset to0. This is not evidence of nonzero offset applied to a live captured track.
- Earlier panel matrix: six widths × three heights × seven states. No horizontal overflow/clipped controls. A small-font issue found in a broader scan was corrected, followed by21 passing layout states.
- Earlier real YouTube page + controlled pinned-task UI:60s focused/visible frame intervals mean6.945ms,p957ms,max14.2ms; UI CPU samples0.562–0.699%. This is not a real analysis-job, continuous-video-playback or separate interaction-latency acceptance result.

## Boundaries

Live subtitle-provider download, long-running real analysis cancellation, fullscreen/Shadow DOM isolation and interaction-specific trace breakdown remain unverified. The controlled result fixture deliberately returns no file path, so the selected download request and missing-path handling are checked without claiming a real download succeeded. Existing layout/advanced controls remain available.

Native screenshots, composition HTML, traces, temporary harnesses, personal files and handoff notes are excluded from this delivery commit.
