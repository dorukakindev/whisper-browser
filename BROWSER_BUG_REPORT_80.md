# BROWSER BUG REPORT 80 — SmartTube browse surface and progressive home feed

Date: 2026-09-19
Starting product commit: `5bd852a0d7778be1d39576267739df49b5eea137`

## Scope and evidence

The user-provided Player screenshot was checked against the current renderer and
the live anonymous public-feed path. No user profile, credentials or private
YouTube data were read.

## Confirmed findings

### B80-01 — Player controls covered the browse surface (P2)

- Reachable path: `setSmartTubeVisible(true)` showed `#smarttubeBrowser`, but did
  not put `#playerStage` into a browse state.
- Effect: the seek bar, time, play, volume and subtitle controls stayed above the
  catalogue because `.player-controls` has a higher stacking context than normal
  player content. The screenshot reproduced this at the bottom of the screen.
- Fix: the stage now receives `.browsing`; playback controls, subtitle overlays
  and resume prompt are hidden only while the catalogue is visible. Returning to
  playback restores them. The close button is hidden when there is no loaded
  media to return to.
- Regression proof: the isolated Electron smoke checks hidden browse controls,
  restored playback controls and the no-video close state.

### B80-02 — Home could remain a bare `Loading…` screen for tens of seconds (P2)

- Reachable path: `feed_home()` waited for both public `popular` and four-category
  `trending` branches. Each branch tried five public instances before yt-dlp.
  Even if popular cards were already available, the renderer received nothing
  until the slowest branch completed.
- Live evidence before the fix: several stored instance hosts returned invalid
  JSON, 404, DNS failure, timeout or 403. One branch produced usable videos while
  the other continued retrying.
- Fix: the backend emits `feed_partial` as soon as either branch completes. Main
  attaches the renderer request generation, preload delivers the payload rather
  than Electron's event object, and the renderer displays the first cards while
  the remaining source continues. Stale generations cannot update a newer page.
- Live evidence after the fix: anonymous run emitted 40 popular cards at 1.6 s,
  95 trending cards at 7.3 s, then the combined final feed at 7.3 s.

### B80-03 — Stored public instance list was stale (P2)

- Four of five stored hosts were no longer in the current official public
  instance list; several failed during the live probe.
- Fix: the five HTTPS defaults now match the official Invidious public-instance
  list checked on 2026-09-19. This remains a volatile external dependency, so
  progressive rendering and yt-dlp fallback remain necessary.
- Source: https://docs.invidious.io/instances/

### B80-04 — Feed failures had no direct recovery action (P3)

- `showError()` replaced the loader with text only.
- Fix: failures now show a localized Retry control. After eight seconds, a slow
  request explains that sources are still being tried and that search remains
  usable. A failed final response no longer erases already rendered partial
  cards.

### B80-05 — YouTube account action could fall below the sidebar fold (P3)

- The YouTube device-login action was after a flexible spacer and the Invidious
  account controls. At the screenshot height it appeared behind the bottom player
  controls or required scrolling.
- Fix: the YouTube account action is grouped with the main YouTube navigation;
  Invidious account controls remain at the bottom.

## Verification

- `npm test` with `backend/venv/Scripts` first in PATH: passed; all suites green.
- `npm run test:electron-bridge`: passed.
- `node tests/run-electron-smokes.js smarttube-boot`: passed, including partial
  feed, failure/retry, browsing layout, account and device-code cases.
- `python -m unittest backend.test_invidious -v`: 62 passed.
- `node tests/report67-smarttube-wiring.test.js`: 66/66 passed.
- JavaScript syntax checks, Python `py_compile`, `git diff --check`: passed.
- Isolated visual capture: `scratch/smarttube-browse-20260919.png` (ignored; not
  committed) confirms the playback controls no longer overlay the catalogue.

## Limits

- Public Invidious availability changes independently of this repository. The
  app now degrades progressively and exposes recovery, but cannot guarantee a
  third-party public server will always be healthy.
- The live probe was anonymous. A real Google account/device authorization was
  not used and no claim is made about personalized account quality.
- The Electron smoke intentionally mocks unrelated IPC handlers; its expected
  `No handler registered` diagnostics are not product-runtime failures.
