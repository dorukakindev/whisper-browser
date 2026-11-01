# Q07 — selected group with neighbouring context

Subagent continued only with `src/renderer/dub-workspace-ui.js`, its existing UI test and new exact related native workspace smoke. No generator/index/model/IPC/style edit; no commits/dependencies/downloads/provider calls. Existing theme and row/button/scroll owners reused. Frontend Design/Premium and Impeccable context/craft floor/polish/canonical resolution consulted; as a subagent with a concrete brief and no user interview channel, the supplied brief/maintained DESIGN.md determined the narrow refinement.

## Existing versus change

Existing workspace offered exact-row **Listen to sentence** and unbounded **Listen to mix**. Neither included a bounded neighbourhood. Added **Listen with context / Komşularıyla dinle** next to the exact-row button using its same button classes, explicit click/Space activation and local EN/TR text (generic locale observer excluded). Tooltip explains up to1.25seconds on each side from the existing full output WAV. No new audio file or source grant.

Selected timeline/quality row audioStart/end define `max(0,start−1.25)` to `min(duration,end+1.25)`. Actual WAV metadata must be available before seek/play. Existing voice/layers/ducking/source-time mix path reused, voice gain retained. Existing exact-row and full Mix behavior remain unchanged.

Ownership captures output object, selected group, audio URL, source mode/tab/media/generation and open dialog. Selection, new generation, output rebuild, dialog close, source change, user pause, error and stop invalidate contextual/pending playback. Metadata callbacks from a changed source cannot start audio. A bounded polling check follows source ownership during pending and playing states. Source stale before click gets existing translated source-changed guidance.

The generator has an independent exact-row rangeEnd on the **same** audio element. Before contextual playback the workspace dispatches the existing same-value `dubQualityGroup` change; the generator's existing listener resets its prior boundary. No new generator interface or edit was necessary. External quality selections synchronize the matching workspace row without redispatch loops.

Initial seek boundary checks wait while `audio.seeking`, avoiding a stale pre-seek playhead clipping the new context. A deliberate manual seek outside the contextual window releases its bound and preserves ordinary transport without forcing play. Normal/full preview has no leftover context limit. User explicitly pauses/stops as usual.

## Important native-found race

The first native run exposed an asynchronous pause event from stopping the previous exact-row preview: it arrived after the new context owner was installed, cancelling the new playback. Added a per-context `started` state, so old pause events before this preview's own play event do not cancel it; user pauses after play still cancel. Unit mocks alone did not expose this queue ordering. Native rerun verifies transition from actual exact-row playback through the old row end.

## Verification

- `node tests/dub-workspace-ui.test.js` → process exit0. Existing assertions retained. New coverage: no autoplay on output/selection; real offsets; +1.25 bound; existing gain; user seek releases obsolete bound; external selection; source generation invalidation; late metadata; busy/close/rebuild cancellation; normal full Mix; EN label.
- `node tests/dub-workspace.test.js` →5passed,0failed, process exit0; portable assets, bounded timelines/mix, cancellation/ducking preserved.
- `node --check src/renderer/dub-workspace-ui.js`, `node --check tests/electron-dub-workspace-context.smoke.js` →exit0.
- Scoped `git diff --check` →exit0.
- `impeccable.cmd detect --json src/renderer/dub-workspace-ui.js` →`[]`,exit0; visual review performed separately.

Native command `D:\Whisper Local\node_modules\electron\dist\electron.exe tests/electron-dub-workspace-context.smoke.js --disable-gpu` via approved hidden Start-Process helper with Wait/PassThru and captured stdout/stderr. **Final actual Electron child exit0**. Full12-second24000Hz WAV decoded to metadata duration12; selected group4–5s starts at2.75s and stops near6.25s (final4×stress-run playhead6.313625s, polling overshoot≈64ms audio time). Verified it passes the generator's prior5s boundary. Audio/source pause callback was invoked. Real Tab→new button, Space start, explicit audio.pause, Space restart, Escape/async close+stop, and source-generation stop passed. Initial immediate Escape assertion was updated to wait for native async dialog close; no product Escape behavior changed.

Native source/pause identity is controlled fixture state; WAV playback/metadata, main renderer, existing generator boundary, DOM, keyboard and layout are real Electron. GPU/naturalness/production waveform quality and arbitrary browser media not claimed. Main profile is isolated per run. Expected stderr `Reklam filtreleri hazırlanamadı: Isolated UI test` is the fixture's blocked network/adfilter request, not a product audio failure.

Artifacts `tmp/quality829/neighbour-native/{1440-en.png,680-tr.png,result.json}`, stdout/stderr `tmp/quality829/neighbour-{stdout,stderr}.txt`. Both actual screenshots contain the new action. Visually inspected680×720TR capture: the three sentence/context controls fit one row, existing footer stays visible, warm graphite/amber identity preserved. Native asserts button containment/hit-test and no dialog horizontal overflow at1440×1000EN and680×720TR. First image capture had stale compositor paint; final capture explicitly shows/focuses isolated test window and waits fonts/two frames/350ms before capture.

Only these product/test files are owned here: `src/renderer/dub-workspace-ui.js`, `tests/dub-workspace-ui.test.js`, `tests/electron-dub-workspace-context.smoke.js`. Other agents' concurrent changes are not part of this report. Native profile/screenshots/report stay in ignored tmp for parent curation. No personal profile or API key inspected.
