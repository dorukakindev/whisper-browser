# Assistant research implementation — final scoped handoff

2026-11-01. Shared worktree D:\Whisper Local\tmp\assistant618. Existing previous corrections preserved. No commit/push. Root requested finishing this slice without further feature expansion.

## 207-card inventory

- `docs/implementation/open-reports-2026-11-01/research-cards.json`
- `docs/implementation/open-reports-2026-11-01/README.md`

Exhaustive denominator: R83818 +R83930 +R84173 +R84260 +RSS26 =207 unique IDs. Current classification counts:132 uygulanacak (includes explicitly partial),70 named merges,4 already existing,1 concrete version-path blocker. Every card retains its original detailed proposal/acceptance and has current code anchors/hash plus pinned upstream source/license. No missing IDs/source/code references. Shared mechanisms have named canonical deliverables; merge does not delete a card's acceptance requirements. The blocker concerns reviewed pysubs2 HEAD requiring Python3.12 while supported install is3.10/3.11; compatible1.8.0 source still needs review. It does not block other work.

This inventory deliberately does not claim the207 cards are implemented. Newly arriving root RSS UI and continuity editions/locks work must have their final acceptance/status updated by root; current RSS rows reference `tmp/open-package-feeds.md` backend evidence and disclose pending UI/player acceptance.

## Actual product implementation

A842-04/05: `search_library` first applies existing kind/status/genre filters, derives bounded aliases ONLY from those catalog records' title/originalTitle, then combines ranked lexical candidate lists with RRF. Original and remake remain distinct catalog IDs. Search metadata explicitly says catalog-only, not media content or semantic search. Empty-query pagination remains existing behavior.

A842-06/08 and A841-24/A842-21 building blocks: reusable retrieval helpers perform scope/revision/end-time filtering BEFORE ranking, rank-based dedup preserving source/revision identities, strict-majority parent coverage, bounded parent text and item/source/revision/page grouping. Actual current-book scan uses them:10 hits, existing40-page batches and200k/page cap retained; parent context only when >50% children matched and within3600/3000-char limits. Book UI remaps source IDs to current mounted owner. No framework, embedding, graph model, or paid API added. The upstream Haystack pinned8e38c633190ee43b80c136b335f8c9d6c79cc5d6 RRF/parent/group patterns were inspected; implementation is independent small JS, not copied framework bodies. Pinned Apache-2.0 references remain in the matrix/code comment.

RSS/A842 selected-source path is real, not helper-only:

- Root script seam: load `assistant-feed-sources.js` after retrieval and before global-assistant. Confirmed page slug `feeds`.
- Feed UI user click dispatches `document` CustomEvent `media-feed-assistant` with detail `{entryIds:[1..3],prompt?}`.
- Listener calls only `window.api.feedsRequest({action:'context',entryIds})`, validates returned IDs/URLs/revisions, freezes<=3 source snapshots/16k text, labels Summary versus Feed text and shortened state, prepares an assistant draft and opens native assistant. It DOES NOT send a model request automatically.
- The explicit feed selection is active only on visible/non-inert feeds home with no active player. Leaving permanently detaches; returning does not silently reattach. Existing active book/PDF contexts retain precedence; stale taste-profile home context does not override the explicit feed selection.
- `search_sources` is advertised only with owner.hasFeedSources. Renderer rechecks actual selected context/owner; search is lexical over those frozen source snapshots only. No global feed/library scan. `research_web` is unavailable inside selected-feed scope, keeping external search from silently widening the corpus.
- Source manifest preserves bounded F sources and source coverage; provider prompt requires supplied F IDs, summary limitations and untrusted data separation.
- Thread workspace/store preserves verified F evidence. Legacy and native managed replies link only known F IDs and open the exact stored HTTP(S) URL via existing openExternal. Fabricated IDs remain text; file/credential URL rows are rejected by cleaner.

## Exact feature product paths

- `src/assistant-retrieval.js`
- `src/assistant-context-manifest.js`
- `src/assistant-source-preview.js`
- `src/assistant-capabilities.js`
- `src/assistant-provider.js`
- `src/assistant-thread-store.js` (also previous bug-fix owner)
- `src/renderer/assistant-book-search.js`
- `src/renderer/assistant-library-actions.js`
- `src/renderer/book-assistant-ui.js`
- `src/renderer/assistant-feed-sources.js` NEW
- `src/renderer/assistant-app-actions.js`
- `src/renderer/assistant-workspace.js` (also previous bug-fix owner)
- `src/renderer/global-assistant.js` (also previous bug-fix owner)
- `src/renderer/renderer.js` — narrow context-selection/F citation additions; preserves previous note/page fixes.

Tests:

- `tests/open-package-assistant-retrieval.test.js` NEW
- `tests/open-package-assistant-feeds.test.js` NEW

## Verification already completed

`node --test --test-isolation=none tests/assistant-threads.test.js tests/assistant-workspace-ownership200.test.js tests/assistant-book-actions.test.js tests/open-package-assistant-retrieval.test.js tests/open-package-assistant-feeds.test.js` —30PASS (18 existing +7retrieval +5feed).

Feed tests include actual agent-service provider-tool loop with controlled model transport, selected RSS context→search_sources→F-cited answer, source manifest and cleaner, actual renderer verified-click behavior, draft/no auto send, detach and unavailable-tool scope. Retrieval tests include remakes, TR alias, ranks rather than score magnitude, duplicate channel votes, revision separation, spoiler prefilter, strict parent threshold/budget and actual book producer.

Previous correction checks rerun after feature changes: B98 original unchanged regression1PASS; open-package-assistant-citations PASS; open-package-research-note5cases PASS. Syntax checks passed for changed modules during implementation.

An earlier broader assistant-workspace798 selection produced13PASS/1FAIL because the unrelated stdio MCP adapter could not spawn in this sandbox (EPERM); no expectation weakened, no claim it passed. Parent already knows previous optional Python module stall; no new broad/backend run was added for these features.

## Remaining outside this slice

- Root actual native Feed UI/main/preload bridge/script integration and Windows screenshots/playback acceptance.
- Cross-film catalog-linked source corpus/alias search and grouped evidence UI; current catalog alias ranking searches metadata and current feed tool searches explicitly selected sources. They are not falsely described as one finished semantic library knowledge index.
- Semantic/graph/multimodal/temporal models, global memory/artifact/deferred-tool/replay features remain individually inventoried.
- Feed summaries are not full articles; full-page retrieval is separate Browser integration. Marked spoiler omitted-state gates come from backend; no universal spoiler classifier claimed.
- No live model/API quality, paid provider, full-suite/CI, GPU/native PDF navigation or new music analysis acceptance. No personal profile/key/media/application used or stopped.
