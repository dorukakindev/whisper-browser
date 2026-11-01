# Recall / content, consumption and taste network

The actual main/preload/home/assistant integration is delivered. Current catalog, feed, own review, book metadata and podcast episode owners are connected. No hidden browser history/full transcript scan is implied.

## API / safe analysis schema

Actions: `catalog`, `add{refs}`, `note-save{title,text,domain}`, `graph{focusId,depth,query,domain,likedOnly,from,to,dateKind,limit,all}`, `node{id}`, `reaction{id,valence,aspect,note}`, `consume{id,eventType,range?}`, `link-preview/link-confirm`, `edge`, `evidence`, `edge-review`, `path`, `context`, `analysis-prepare/analysis-commit`, `hypotheses/hypothesis-review`, `recommendations`, `view-save`, `position`, `alias-merge/alias-unmerge`, `remove{mode:'network'|'derived'}`, `export`.

- Source IDs in selected context: `/^R[a-f0-9]{16}$/`, derived from source node+revision. One–three sources; each5000 characters and total14000. Explicit UTF-16 ranges can be selected by `scopes:{nodeId:{start,end}}`; actual scope, revision, reactionRevision, startOffset/endOffset, missing/shortened content and safe locator remain attached.
- Taste preparation requires at least one explicit like in **one domain**. Same-domain explicit dislike/mixed may be included as counter-evidence. Neutral consumption cannot become positive evidence. A source with a personal reaction note uses that note as `scope:user_reaction` for the taste snapshot; original content does not silently stand in for why the user liked it. Otherwise its actual metadata/summary/body scope remains explicit and any reason is still a proposed hypothesis.
- Prepare returns token, frozen sources and schema. Result is `{entities:[{key,label,kind:'theme'|'person'|'form'}],assertions:[{from,to,predicate,sourceId,quote,start?,end?,unit:'utf16',reason?}],hypotheses:[{text,support:[{sourceId,quote}],counter:[...]}]}`. Predicates are a bounded whitelist. Node/entity/source IDs must come from this selected scope; exact quote range must match supplied text. Model-generated URLs are not evidence.
- Commit rechecks current source and reaction revisions, including unlike after API start; stale input is refused. All model assertions/hypotheses start **proposed**. No output can directly mutate user preference/ratings/watched state. Model identity is run metadata; credentials are not part of the schema. Prepare tokens are consumed before commit validation; there is no automatic doublecommit or fee-producing retry.
- Graph evidence returns current/stale/removed status; old receipts are never silently rebound to a new source revision. Network hide and derived-data purge differ. Purging one source removes its quotes/own derived claims and drops its ownership; independently supported entities/relationships remain. Source-media files are never deleted.
- Recommendations use only same-domain explicit positives, known metadata intersection and explicit same-domain negative counter-evidence. Candidate revision and missing-evidence status are returned. Unknown semantic style/reason is not invented; no probabilities. With zero likes it is labelled source browsing. Candidates currently come from existing local owners, not a fictitious internet-wide discovery API.

## Research decisions — current / implemented / honest limits

| Research IDs | Applied behavior |
| --- | --- |
| A01–A03 | Existing owner references, distinct content/review/episode types and explicit consumption events. Saving/opening/completing/rewatching never sets a like. Default film favorite/high personal score remains an explicit existing source signal; graph reaction controls its own current inclusion override. No duplicate film store. Browser/subtitle collection requires a future trusted owner adapter; this delivery does not connect one. |
| A04–A06 | Bounded selected text ranges and source revision/scope are present. Metadata, personal review, reaction note, feed summary and publisher-supplied full text remain separate. No claim to have read a whole film/transcript/book from metadata; actual subtitle original/translation/page/time owner adapters remain root integration rather than a new parser/model. |
| A07–A12 | Typed edge reader with origin/status/reason and real receipt IDs; manual versus metadata versus API proposals; explicit concept-label alias merge/undo, never film/remake name merge;1–2hop/path explanations; source/reaction change and source purge invalidation. Original media navigation is delegated by validated owner ID/locator to root. Graph path is explicitly not recommendation evidence. |
| A13–A18 | Like/dislike/mixed/clear, aspect and own reason; external Letterboxd reviews are not imported as personal opinions. Taste hypotheses retain exact support/counter receipts, domain, dates, source count and review controls Correct/Partly/Wrong/Obsolete. A sparse source creates no automatic personality/reason claim. Fine scene/page reaction capture depends on trusted underlying source ranges; no fabricated timestamps. |
| A19–A24 | Selected<=3 source context, lexical local browsing, evidence IDs and bounded API analysis contracts reuse shared assistant. No automatic request on view/open. Revision/reaction changes prevent late-result adoption, prior runs retain source/model labels. Root/assistant bridge owns actual remote-provider execution and conversation UX. Rich semantic comparison/clarification quality is provider dependent, not claimed by deterministic code; run/source changes are inspectable, not an automatic semantic diff model. |
| A25–A30 | Separate same-domain recommendation view/pools with positive/counter metadata reasons and missing-evidence labels. No graph-proximity taste propagation. Existing feed→catalog confirmed relationships appear as about edges. Community Letterboxd comparison continues through existing verified workflow; no new scraper/external review corpus or paid candidate service was introduced. |
| A31–A36 | Default1hop, explicit2hop, hard display budgets/counts, stable coordinates/locked drag positions, synchronized accessible list, distinct added/published/consumed/analysis filters, saved views with filter/date/camera, bounded Back stack, reject/undo alias/removal/export. No large-archive FPS/GPU guarantee. Source-only removal does not delete media; full derivative purge clears graph-owned receipts/claims without changing source-owner files. |

This is a coherent usable first slice, not a claim to have installed the thirteen compared platforms or delivered every future full-library semantic feature. Existing film recommendation behavior, source/reading UI and K mechanisms remain independent owners.


## Public source references, distinct from original local reports

Main and all four Recall appendices/source manifest were read. Actual cached Quivr range validation, Cognee provenance partition, Cytoscape neighborhood and Sigma label/settings code plus relevant license bodies were inspected. No AGPL/BSL/custom-licensed UI/server was copied. Independent mechanisms reference:

- [Quivr Unicode/source range validation](https://github.com/QuivrHQ/quivr/blob/0f9ce97492ebc2f577629bcc958f377e4f8673c0/internal/content/plugin.go#L68), MIT.
- [Cognee source ownership deletion](https://github.com/topoteretes/cognee/blob/525b1d1179c550cd5b5661bcbf8f00f57a676928/cognee/infrastructure/databases/unified/provenance_delete_planner.py#L60), Apache2.
- [Graphiti temporal source assertions](https://github.com/getzep/graphiti/blob/16bf514380de4e44884aed6779bece220e6fe470/graphiti_core/edges.py#L263), Apache2 behavior reference.
- [Sigma label/display settings](https://github.com/jacomyal/sigma.js/blob/13062dc5be4f876d7c188411b120bb5a3a0be6f4/packages/sigma/src/settings.ts#L112), MIT behavior reference, not added as a dependency.
- [Cytoscape explicit neighborhood traversal](https://github.com/cytoscape/cytoscape.js/blob/acaa3ad9a1288a8242948fe3d9f1c674c25adea9/src/collection/traversing.mjs#L142), MIT behavior reference.
- [Recall graph selection/exploration documentation](https://docs.recall.it/deep-dives/graph/selection-and-exploration), product interaction reference only; no claim to its private server implementation.

Original local research remains local/unpublished; this new implementation note/public-link matrix is separate.
