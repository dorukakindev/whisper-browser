# R79 — SmartTube-style player and YouTube device sign-in verification

Date: 2026-09-19. Product-code starting point: `5a82024`; fix commit: `59174a7ee5a1f27fbb0956e8301adcef9a8646fd`.

## Verified findings

1. **Stored OAuth client still opened the first-run form.** `openYoutubeLogin()` always selected `ytClientView` even when `youtube:session` returned `hasClient: true`. The button then worked only if the user guessed they should press “Save and continue” with empty fields. The fix opens the device-code view automatically for a saved client; first-time setup remains available.
2. **Old device-code completion could cancel a newer login attempt.** The stale-generation branch of `startYoutubeDeviceFlow()` called `youtubeCancel()` and cleared the shared `_ytPolling` flag after a new flow might already have started. The close/change controls already cancel their own flow. The stale branch now returns without touching the newer one, and `finally` clears the flag only for its own generation. A delayed-code Electron probe exercises this sequence.
3. **Signed-in Home was still a public Invidious feed.** Only Subscriptions used `youtubeBrowse()`. Home now tries the account's `FEwhat_to_watch` feed; an empty/failed response falls back to the public feed with an explicit source notice. This is a best-effort InnerTube path, not a guarantee that every account returns personalized recommendations.
4. **TV browsing hierarchy was too compressed.** The player home used 88px navigation, 13px titles, and 220px minimum cards. Sidebar, focus outline, card size and spacing were increased within the existing graphite/amber system. An isolated Electron capture and width probe checked the rendered layout; mock thumbnails are intentionally not fetched.

## Verification

- `node tests/run-electron-smokes.js smarttube-boot`: pass, including automatic device-code entry, copy, post-poll account state, personalized Home and stale-request race. This uses mocked IPC/Google responses and an isolated window.
- `node tests/report70-youtube-oauth.test.js`: 19 passed.
- `node tests/report67-smarttube-wiring.test.js`: 66 passed.
- `node tests/design-system.test.js`: pass. It initially found an accent-contrast mismatch in the new brand mark; corrected before the final run.
- `npm test`: all tests passed on the final full run.
- `npm run test:electron-bridge`: passed.
- `node --check` on changed JavaScript and `git diff --check`: passed.

## Open limits

- No real Google account, publisher OAuth client, or live YouTube authorization was used. The real account flow and InnerTube personal Home need an authorized manual acceptance test. Do not treat mock success as proof of live sign-in.
- [Google's YouTube device OAuth guide](https://developers.google.com/youtube/v3/guides/auth/devices) requires a registered OAuth client and recommends the installed-app browser flow for a Windows app with a browser and full input. A truly one-click public-app sign-in needs an app-owned, policy-compliant client/verification decision; third-party SmartTube credentials must not be copied. Existing BYO-client device flow remains explicit.
- [SmartTube](https://github.com/yuliskov/SmartTube/blob/master/README.md) is an Android TV application, not a drop-in Electron module. This change adapts interaction and visual hierarchy; it does not bundle or run SmartTube, import its account, or claim pixel-identical parity.
- Concurrent unrelated documents, temporary artifacts and the user-data profile were not edited or committed.
