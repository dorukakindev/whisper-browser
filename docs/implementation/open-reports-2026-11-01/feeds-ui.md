# Feeds UI — quick integration contract

NEW files only: `src/renderer/media-feeds-ui.js`, `src/renderer/media-feeds-ui.css`. No main/preload/home/index changes by this subagent.

```js
const controller = window.MediaFeedsUI.render({
  host: content,
  api: packet => window.api.feedsRequest(packet),
  locale: window.UiLocale?.get?.() || 'en',
  onOpen: ({entryId, mode, enclosureIndex}) => {
    // Root main bridge resolves the stored entry ID; mode is 'source' or 'play'.
    // Do not open arbitrary renderer-supplied URLs.
  },
});
// Before replacing the route host:
controller.dispose();
```

`render` returns `{dispose,reload}` synchronously. API may also be an object exposing feedsRequest. Default API is window.api.feedsRequest. No onAssistant callback is needed: document event `media-feed-assistant` contains `{entryIds}` and the assistant agent's new listener owns the single context read and prepared draft; no model call occurs in this page.

Features: graphite/amber typography and shared theme variables; internal collapsible source selector (no general sidebar); type/search/unread/saved/later filters; real source artwork when supplied; canonical source rows and provenance;1–3 source selection; reading pane with summary/feed-text/truncation scope; explicit spoiler reveal; read/save/later state and snapshot mark-visible-read/undo; original-source/media opening by stored ID; exact catalog relation preview+confirm and unlink; source health/failed-last-update/last-success metadata; paused/enabled/manual-refresh management; unsubscribe preserves saved/linked sources; drop URL; native add/OPML dialogs with discovery and preview, selected OPML import and copyText export. No read automatically marks watched or calls a model.

Below1160px reader replaces list with Back, returning focus to the original row. Below760px source selector and controls stack. Wide screen has source list and separate readable text plane. Reader text has no inner scrollbar. Existing app typography/font/theme and reduced motion are reused.

One requested focused check: `node tmp/open-feeds-ui-check.cjs` → PASS, using real feed backend with isolated temp store + JSDOM. Verified EN/TR rendering, absence of spoiler text before reveal, consent reveal, saved state, <=3selected assistant event, discovery/preview no subscription write, explicit subscribe, controller disposal. `node --check src/renderer/media-feeds-ui.js` passes. No expanded test suite or new research was run for this UI task. Root owns actual Windows screenshot/narrow/native visual check and source/play bridge.

Known conservative detail: unknown spoiler text linked to a confirmed library title is gated unless source consent is already present; link watch status is currently not returned by feed backend, so those links are treated cautiously. UI also blocks adding such unrevealed text to the assistant. Marked-source consent is stored separately from read/save state.
