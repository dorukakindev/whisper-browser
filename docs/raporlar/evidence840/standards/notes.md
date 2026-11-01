# R840 — Assistant standards review

Current product HEAD: f3713c9fe7855f9e9a92bab5fcf65e2d5a69a74d. Review base: d78242ead655c3257b2139d3b5690d7d15c63e26. Read-only review; no product/test/settings changes, no live API, no private profile, no commit/push.

## Result and evidence limits

No independently new confirmed assistant bug is claimed by this axis. The existing web-source budget mismatch at assistant-agent-service.js:120–122 is already R815-B98/R830-01, and is excluded. R835 page citation and book B1-0 collisions, R837 CR-only SSE are also excluded. Current workflow/guard/receipt code was inspected; this is not a declaration that all assistant behavior is correct.

Read AGENTS.md, CONTRIBUTING.md, DESIGN.md, YENI-BILGISAYAR.md, DEVIR-NOTU.md, docs/devir/2026-11-01-1420.md, recent report contents relevant to assistant, and Night1000 README/registry signatures. F01/F02/F03/F04/F05/F09/F50 scenario IDs/signatures are recorded in registry-reviewed.json. Historical PASS is not treated as current acceptance.

Targeted execution:

`node --test tests/assistant-quality829.test.js tests/assistant-workflow654.test.js tests/assistant-flows.test.js`: exit 1 because the sandbox rejects spawning child test workers (EPERM); no test body ran.

`node --test --test-isolation=none tests/assistant-quality829.test.js tests/assistant-workflow654.test.js tests/assistant-flows.test.js`: exit 0, 23 passed, 0 failed. Existing real agent service/provider/flows/settings modules run with controlled provider and renderer responses. Tests cover ambiguous translation card blocking, read-only source/range plan, attached-translation shortcut, exact-job ownership, continuation exclusive lease/rollback, failed-stage retry identity, settings rollback/undo/serialization. They do not prove live model instruction following, native GUI, long-job acceptance, Windows start.bat/GPU or arbitrary languages.

Rejected suspicions: proposals are actually expired before the capacity check (assistant-agent-service.js:165), and jobBindings is bounded to 50 entries (:235); neither was reported as an unbounded leak. Continuation UI resubmits row.origin.question (assistant-agent-ui.js:110), so the new ambiguity guard's input.question does not incorrectly consume a literal generic Continue string on that production UI route. Workflow plans explicitly require review of attached translation completeness and mark every step planned; an incomplete attached track alone is not proof of false readiness.

## Separate improvement suggestions (not bugs)

### S840-ST1 — Give plan operations a typed contract

Start: assistant-workflow-plan.js:20–35 uses the same `tool` field for callable registry tools (`get_job_result`, `start_voice_generation`) and conceptual operations (`choose_translation_source`, `translate_selected_source`, `review_attached_translation`). A safe future extension should distinguish `kind: action|check|choice` and optional registered action reference, with a validated dependency ID rather than the function-looking name as dependency identity. This does not authorize execution and does not replace the current human-reviewed workflow.

Acceptance: every actual action reference exists and is available for the source; every dependency references a unique preceding step; conceptual choices are never presented as callable tools; current execution=plan_only and per-action approval remain. This is internal contract maintenance, distinct from R830-G02's user-facing source picker and R837-G03's long-book research checkpoint. Existing output causes no demonstrated current execution bug.

### S840-ST2 — Extract cohesive mutation admission and application policies

Start: assistant-agent-service.js:138–196 and :228–249 coordinate source validation, prerequisite cards, retry eligibility, settings snapshots, library identity, job attachment, proposal reuse/expiry and final application. Raw tool-name groups recur across these stages while capabilities.js owns tool schemas and workflow-plan.js owns order. Add a small policy boundary for mutation admission/snapshot/revalidation, rather than another universal dispatcher or a new agent framework. Keep service responsible for request lifecycle and emit/IPC; keep provider responsible for transport.

Acceptance: existing 23 regressions pass unchanged, plus only focused checks for the moved boundary; no capability gains, no cross-source acceptance, no approval bypass, no broader data payload, no implementation-only product labels. This addresses shotgun surgery/divergent change rather than claiming code size itself is a bug. It is distinct from R839 external-agent SDK/compaction feature proposals.

## Adjacent snapshot inspection requested by parent

Read assistant-thread-store.js, renderer/assistant-workspace.js, assistant-jobs.js, renderer/assistant-jobs-ui.js, assistant-flow-state.js, assistant-collections.js, assistant-tool-results.js and assistant-retrieval.js beyond changed hunks. These modules are snapshot review; no introduction in the recent diff is implied.

`node --test --test-isolation=none tests/assistant-threads.test.js tests/assistant-jobs.test.js tests/assistant-collections.test.js tests/assistant-workspace-ownership200.test.js`: exit 0, 29 passed, 0 failed. Together with earlier changed-area checks, 52 existing targeted cases pass. Thread tests use real store/disk and synthetic documents; renderer ownership tests use JSDOM. Collection tests use real catalog persistence. Tests cover optimistic revision conflicts, malformed archives, parent graph validation, source isolation, late result ownership, pending-save/delete order, refresh replacement, exact-job cancellation, stage transitions, and atomic catalog membership with stale-plan rejection.

No additional independently new confirmed bug resulted. The ledger's `partial` field is intentionally intermediate-output presence; terminal partial completeness is read from result.artifacts by assistant-flow-state.js. R658/R813 explicitly document this distinction, so it is not misreported as every successful job being partial. Branch draft is transient after create and omitted by cleanThread; this was not upgraded into a new persistent-draft bug because existing durable-draft/branch lineage proposals already cover that product scope and no current persistence contract for unsent drafts was established. Copies of historical branch action IDs cannot bypass current owner/thread validation; no unauthorized application claim is made.

## Independent review of parent speech-boundary candidate

Reviewed .tmp/audit840-speech.py, .tmp/audit840/parent/speech-result.json and actual test_transcribe._sentence_translate transport adapter. Independently reran `backend/venv/Scripts/python.exe .tmp/audit840-speech.py`: exit 0. Results reproduced gap2 breaks=[1], gap8 breaks=[], marker breaks=[1], while all three role source_items carried scenes [0,0], without warnings.

Accept as a P2 request-contract bug: transcribe.py:4351–4352 uses the configured threshold plus detect_scene_boundaries' explicit location-marker policy; speech_relations.py:43–46 rebuilds scene IDs with a literal eight-second gap and omits markers. Role PROMPT says scene numbers separate conversations and forbids cross-scene resolution; two application-recognized scenes are therefore falsely presented as one. Actual incorrect model role inference or final translated meaning was NOT demonstrated. The controlled adapter deliberately returns empty role fields and valid deterministic translations; successful final output cannot prove or disprove live model quality.

Scope qualification: root reconstruction logic predates the reviewed recent diff; ba04414f broadens is_risky so the probe's ordinary multi-person clauses newly enter this old inconsistent path. Prefer 'newly confirmed, pre-existing root with expanded reach' over a claim that the literal8 was introduced in ba04414f. Custom gap and explicit-marker variants share one missing-boundary-propagation root and count once. R734 documents eight-second role grouping and prior model-quality failures, but does not report this mismatch against the caller's recognized/configurable scene boundaries. R815-B41 is user scene-note translation-memory scope; B70 exact cache canon identity is separate. F14 historical generic quality mechanisms are not evidence for this precise boundary contract. Do not count the separate general antecedent selection/model ambiguity as an additional bug.

Suggested acceptance: preserve caller-owned per-group scene IDs/breaks into independent role payloads, rather than duplicating detection. Check configured2/default8/disabled0 plus INT./EXT. signals, and skipped ordinary groups, without admitting neighbor drafts. Guard compatibility: adjacent scenes can share a transport batch, but must have distinct IDs; do not require one provider request per scene unnecessarily.
