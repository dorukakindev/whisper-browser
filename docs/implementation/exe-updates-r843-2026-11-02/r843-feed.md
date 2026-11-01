# R843-07/08/09 local implementation handoff

Base: `08e9e851`, branch `codex/exe-updates-feeds`. No commit/push/Actions/API/personal profile access. Original local report and review843 package were read and executed in place, not copied into this checkout.

Before fixes, `node D:\Whisper Local\docs\raporlar\review843\probes\feed-podcast.cjs` reproduced all three failures: revert retained changed=1; hidden duplicate correction=null and ack left changed=1; rolling podcast refresh removed the personal binding (offline copies=0, fixture file still existed).

Changes:
- `src/media-shelf-service.js`: preserve missing prior episodes when a rolling RSS feed refreshes. Existing GUID/URL matches merge once; older identities retain personal binding, notes, position and transcripts. Refresh is not an episode deletion request. The existing 16 MB shelf bound remains; long-lived subscriptions may retain older episodes until the podcast is explicitly removed.
- `src/feed-store.js`: aggregate outstanding corrections with exact physical entryId/feedId/toRevision and source title, with a compatibility `correction` first item. Recompute against the read baseline and clear reverted/no-diff corrections. Preserve the first correction baseline for initially-read entries that have no readSnapshot. Acknowledgement requires the exact physical entry and displayed revision and rejects missing/stale/wrong-copy revisions; it cannot acknowledge other duplicates.
- `src/feed-service.js`: forward correction revision to the store.
- `src/renderer/media-feeds-ui.js`: show all outstanding duplicate corrections with their source names; each button sends its physical entry ID and displayed revision, then reloads counts and the original reader.
- `tests/r843-feed-podcast.test.js`: three focused regression tests: exact/stale duplicate acknowledgements + persistence, reverting including empty/initially-read baselines, rolling podcast refresh and returning episode identities. Real production handler with only Python process boundary controlled; no shared require-cache changes.
- `tests/four-media-sources.test.js`: existing K07 ack call updated to the explicit revision contract (assertions unchanged).

Observed checks:
- `node --test --test-isolation=none --test-name-pattern='R843|K07' tests/r843-feed-podcast.test.js tests/four-media-sources.test.js`: 4/4 PASS, ~286 ms.
- After code review identified the initially-read/no-snapshot refresh edge, baseline fallback and its assertions were added; only `node --test --test-isolation=none --test-name-pattern='R843-09' tests/r843-feed-podcast.test.js` reran: 1/1 PASS, ~133 ms. This is one targeted verification repeat, not five unique tests.
- `node --check` on feed-store, feed-service, media-shelf-service and media-feeds-ui: PASS before final two-line baseline fallback; focused test loaded the final feed-store successfully.
- Scoped `git diff --check`: PASS after final edits (existing LF/CRLF warnings only).

Not run: full suite, native Windows UI/render checks, live RSS/Python/network end to end, API/model/GPU. The original broken-behavior probe is expected to fail its assertions after these fixes and was not rerun as a success test. Changes remain uncommitted for root integration; unrelated working tree files were preserved.
