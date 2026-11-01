# R842 RSS backend foundation — verified handoff

2026-11-01, Windows. Only NEW `src/feed-parser.js`, `src/feed-store.js`, `src/feed-service.js` and `tests/feed-{parser,store,service}.test.js` were edited for this assignment. Main/preload/UI and dependency integration belong to root. No commit/push, profile access or personal application shutdown.

Read the entire RSS_MEDIA_LIBRARY_BLUEPRINT, selected source map, code examples and local YouTube/OPML/media network helpers. Inspected actual rss-parser parser.js at pinned upstream `394178530e87fa010efc6e8d5dd4e801715c5e63`, and installed saxes6.0.0 parser source/package (ISC). No AGPL/GPL application code copied. Normalization/state implementation is original; selected upstream patterns are explicit preview, feed-native IDs versus canonical sources, conditional validators after successful parse, and state/provenance separation. Miniflux pinned finder source was unavailable via the web fetch; no claim to have executed or copied it.

## Registration / IPC

`registerFeeds({app,ipcMain,authorized,userData=()=>app.getPath('userData'),catalogStore,fetchValidated?,autoStart=true,now?})` registers `feeds:request` and returns `{handle,store,refreshDue,dispose}`. Default production fetch is a public-only DNS-pinned Node HTTP transport. `fetchValidated` is an injectable trusted network adapter for controlled tests or a future platform proxy adapter, **not renderer input**.

All replies have `{ok:true,...}` or `{ok:false,error,errorKind}`. Actions:

- `list` → `{feeds,settings:{paused},counts:{entries,unread,saved,later},desktopOnly:true}`.
- `discover{url,requestId?}` → `{candidates:[{url,title,type}],direct,preview?}`. A direct feed includes a reusable preview/token, avoiding another fetch.
- `preview{url,requestId?}` → `{token,feed,entries:last5,count,contentScope,frequencyDays}`; no subscription/write.
- `subscribe{token,title?,folder?,initial:'now'|'latest20'|'all'}` → `{feed,inserted,updated?}`.
- `refresh{feedId?,requestId?}` → `{results:[{feedId,state,inserted,updated?,error?,errorKind?}],...list}`; maximum8 manual feeds. `cancel{requestId}` aborts only the owning sender's request.
- `settings{paused}`, `feed-update{feedId,enabled?,title?,folder?,intervalMinutes?}`, `unsubscribe{feedId}`.
- `entries{feedId?,kind?,unread?,saved?,later?,query?,limit?,offset?}` → `{rows,total}`. Canonical source grouping preserves each distinct entry ID and feed provenance. `entry{entryId}` → `{entry}`.
- `state{entryIds,read?,saved?,later?,spoilerAllowed?}` → `{token,updated}`; `undo{token}`. UI should pass the displayed row's `entryIds` to change all current copies of one canonical source. Explicit snapshot IDs ensure later new articles remain unread. Undo refuses intervening user-state changes.
- `opml-preview{text}` → `{token,rows:[{url,title,folder,existing}],rejected}`. `opml-import{token,selectedUrls,initial?}` subscribes only chosen previewed addresses, with no fetch during import. `opml-export` → `{text}`. Existing YouTube subscription files/modules are untouched.
- `link-preview{entryId,catalogId}` → `{token,entryId,catalog,source,automatic:false}`. `link-confirm{token}` verifies both current catalog identity and source revision before saving. `unlink{entryId,catalogId}`, `related{catalogId}`. Entry links expose `state:'confirmed'|'stale'|'missing'`; related excludes stale/missing identities, retaining old relation data in the feed store.
- `context{entryIds}` selects1–3 canonical sources, returns `{sources:[{id,entryId,title,url,text,scope,revision,shortened}],text,counts,budget:16000}`. No model call. Feed summary versus publisher-supplied full content remains explicit. Marked spoilers without consent are omitted. Source IDs include entry+revision.

## Data / security / lifecycle

- XML uses production `saxes` with2MB input,200 entries,30k nodes,40 levels and600ms event deadline; DOCTYPE/entities rejected. JSON Feed1/1.1 has its own adapter. HTML is converted to plain text by a linear tokenizer; no feed HTML enters a DOM. Mixed Atom XHTML text order is preserved.
- Public URLs only; reject credentials, private/reserved literal hosts, signed/token URLs, unsafe ports, unsupported schemes. Existing browser-place-url redaction vocabulary and browser-manga public-IP classification are reused. DNS must resolve entirely to public addresses; transport connects to the verified pin, keeping original Host/TLS SNI. Every redirect is revalidated and re-pinned; HTTPS downgrade refused. Cross-origin redirects drop validators; public requests never send Cookie/Authorization even when those headers are supplied to the exported transport.
-15s transport deadline,4 redirects,2MB compressed and decoded body bounds, streamed gzip/deflate/Brotli limits. Non200 bodies are closed rather than drained. No cookies, sessions, arbitrary file reads, media downloads or model calls.
- Atomic `feeds.json`, validated16MB envelope,200 subscriptions,4000 retained entries. Same feed+native ID+source URL upserts. Reused GUID/different URL preserves both; two feeds' same canonical URL group without title-based merges. Read/saved/later/links persist through updates/304/errors/reload. Unsubscribe preserves saved/later/linked entries and their source-feed provenance.
- ETag/Last-Modified advance only after parse+atomic commit.304 and errors keep existing bodies/user state;429 Retry-After affects nextAttempt. A failed parse does not poison validators. First-import ranges also apply to pending OPML feeds; empty valid snapshots count as successful checks.
- Source text is bounded50k with `textTruncated`/`sourceLength`; context further bounds each source6000 and total16000 characters, with `shortened` explicit. Enclosures are validated and typed audio/video separately. No watched/rating/listening state in existing media stores is changed.
- Desktop startup catch-up after5s, timer60s, maximum4 due feeds per run, host wait60s and per-feed15min–7day interval. Pause stops scheduler; manual refresh remains explicit. Per-feed in-flight guard prevents stale concurrent refresh commits. `dispose`/before-quit abort requests and clear startup/timer/tokens. No closed-app background service.

## Verification

`node --test --test-isolation=none tests/feed-parser.test.js tests/feed-store.test.js tests/feed-service.test.js tests/subscription-feed.test.js tests/subscriptions-io.test.js` → **14/14 pass**, comprising12 new feed tests plus two existing YouTube test files (subscription-feed separately prints35 internal assertions; not counted as35 new full tests).

New checks cover RSS/Atom/JSON/CDATA/XHTML, malformed/DTD/depth/body bounds, discovery/OPML unsafe URLs, atomic reload, native-ID collisions, canonical provenance, state/undo races, pending initial cursors, preview-no-write, conditional304, malformed200 validators, offline retention, catalogue preview/confirm/remake-staleness, summary-context provenance, public DNS rejection, redirect pins/header isolation, decompression bombs, cancellation/pause/disposal.

Actual live source check used the new default pinned transport and parser: Criterion official `https://www.criterion.com/feeds/current` returned **HTTP200 /335641bytes /RSS /20entries**, classified as publisher **summary** scope. Evidence: `tmp/open-package-feed-live.json`. No account, cookies or provider used. This single success is not a reliability guarantee for every feed/site.

`node --check` all3 production modules; focused whitespace diff check pass. UI/native appearance/playback and root main/preload integration are not validated by these backend checks.

## R842 card matrix — backend scope only

| Cards | Status in this slice |
| --- | --- |
|01–03 | Backend discovery,5-entry preview, explicit subscribe and initial range implemented. Generic RSSHub URI routing is not implemented. |
|04–05 | Typed entries and independent read/saved/later/library-link fields implemented; actual cards/navigation/player are root UI. |
|06–08 | Explicit catalog preview/confirmation, related lookup, stale identity guard, canonical clustering/provenance implemented; automatic subject-matching is not implemented. |
|09 | Feed summary/full labels and truncation bounds implemented. Full-page extraction/save remains Browser/root integration; no automatic scraping. |
|10 | Selected1–3source evidence/context backend implemented. Source-bound assistant send/UI belongs to root. |
|11 | Unknown/marked/user-consent data states and marked context gate implemented; no universal spoiler classifier or watched-link UI gate claim. |
|12–13 | Digest scheduler and library/person relevance filters beyond explicit catalog links are not implemented. |
|14–15 | Validated typed enclosures preserved; no new player or progress store. Existing podcast positions left untouched. Root owns explicit playback routing/bridge. |
|16–20 | OPML previews/import/export, health/conditional/error/offline states, bounded desktop scheduling/pause, snapshot read/undo backend implemented. |
|21 | Dry-run tagging/rule engine not implemented. |
|22 | Disable/unsubscribe preserve durable saved/later/linked source records; weekly grouping/mute digest UI not implemented. |
|23 | Feed ID survives safe effective-URL redirects with original/effective URL visible; explicit address-edit/migration workflow not implemented. |
|24–26 | RSS publishing, RSSHub route catalogue, Discover shelf are not implemented. |

Remaining root delivery requirement: **add `saxes:6.0.0` as a direct production dependency and lock it**. It currently resolves from the existing primary node_modules through development jsdom; that alone is insufficient for packaged production. Root was notified twice; no existing package file was edited by this scoped subagent.

Other limits: default pinned Node transport does not implement platform/system proxy negotiation; a trusted secure proxy-aware adapter can be injected. No native Windows UI/DPI, full article extraction, end-to-end playback, live provider,200-feed soak or full CI acceptance is claimed.
