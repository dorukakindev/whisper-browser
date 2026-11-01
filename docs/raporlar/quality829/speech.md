# R829 speech — Q11–Q15

Base: `d78242ead655c3257b2139d3b5690d7d15c63e26`, branch `codex/dub-assistant-quality829`. No commits. Read AGENTS.md, DESIGN.md, YENI-BILGISAYAR.md, latest 1059 handoff, model rule, audit README and relevant registry source/family rows. No blind 1000-case rerun.

## Existing coverage mapped before edits

Registry: F11 N0201–N0220 (browser scheduling/pairing), F12 N0221–N0240 (translation memory), F13 N0241–N0260 (adaptive planner), F14 N0261–N0280 (sentence translation). Historical PASS is not current proof. Existing speech-v17 already has source-anchored translation + editorial review, number/negation/modal/name gates, role rereading for explicit contrast, frozen bilingual neighbors, local-topic term hints with competing candidates, source-preserving duration rules, partial-status review and selected cue-range retry. These are existing features, not newly discovered bugs.

## Exact dispositions

| ID | Disposition | Concrete result / evidence |
|---|---|---|
| Q11 subject/negation/number/meaning | Enhanced | `backend/speech_relations.py:is_risky` now independently rereads noncontrast groups containing multiple distinct person references, e.g. “She gave him her key”, rather than limiting rereading to “not my/me” contrasts. Existing hard number/negation/modal/quantity gates retained. `test_speech_relations.py:test_noncontrast_person_roles_receive_independent_source_review` + production context regression; existing `test_speech_translation.py` meaning/anchor cases and Node `speech-fidelity733.test.js` passed. Semantic correctness of a real model is not proved by controlled transport. |
| Q12 long-video term consistency | Existing, verified | `transcribe.py:speech_review_terms` filters relevant source terms and surfaces competing targets; source+accepted-target evidence is mandatory for durable memory. Existing `test_review_terms_are_deterministic_bounded_and_not_invented` and `test_review_terms_follow_local_topic_and_expose_conflicts` passed. No forced first-seen term lock or invented glossary. |
| Q13 pronoun/reference/context | Enhanced | `speech_relations.py:batches` now carries nearest scene-bounded `context_before/after` source strings into independent role reading. Previously those were discarded when risky/ordinary groups were packed separately. Context is capped at four rows / 1200 characters each, and only attached to matching request edges. Draft translations, document summaries, generated terms and malformed context rows excluded. Added bounded/source-only test, internal-scene isolation test, and production-adapter antecedent test; existing scene and failure/cancel tests pass. |
| Q14 duration-friendly meaning-preserving delivery | Existing, verified | Speech payload excludes visual `max`; duration is context, not deletion budget. Existing readaloud/source-anchored rules, original timing preservation, redistribution and `test_review_accepts_natural_syntax_without_duration_compression` all passed in 33-case speech suite. No arbitrary speed compression or weaker completeness gate introduced. |
| Q15 missing ranges + targeted retry | Existing, verified | Existing result summary exposes partial ready/incomplete counts plus numbered empty/source/meaning rows, timeline range conversion and source-preserving `translate_cue_range`. `backend/test_translation_range749.py` 3/3 passed, including actual translate-only selected-cue production path with outside text read-only and preserved output. Existing retry cached-draft test confirms no fresh first-pass translation and zero third-run requests. Node summary EN/TR partial-result tests and 15 review-surface checks passed. No new UI surface needed. |

## Files changed

- `backend/speech_relations.py`: expanded source-role risk trigger + bounded independent request-boundary source context.
- `backend/test_speech_relations.py`: four focused new regressions (risk coverage, bounded source-only boundary, internal scene isolation, actual production adapter).
- `backend/test_speech_translation.py`: three role-sensitive fixtures now explicitly return controlled unknown role proposals; expected first run includes independent role request and source-only retranslation, retry includes role+refine, completed cache still makes zero requests. Existing cache assertions were retained, not disabled.
- Parent-authorized narrow edits only: `backend/transcribe.py` protocol constant; two matching `src/renderer/renderer.js` literals; `tests/browser-youtube-whisper.test.js` expected protocol. New protocol `speech-v18-pronoun-context-review` prevents old speech-v17 refined cache/output/track reuse from bypassing expanded review. Ordinary subtitle mode unchanged; saved files are not deleted. A first speech request can incur a fresh pass and additional role request for the newly eligible groups.

## Verified commands / real exits

- `python -m unittest discover -s backend -p test_speech_relations.py -v`: 14 tests, exit 0.
- `python -m unittest discover -s backend -p test_speech_translation.py`: 33 tests, exit 0.
- `python -m unittest discover -s backend -p test_translation_range749.py`: 3 tests, exit 0.
- `node --test --test-isolation=none tests/translation-review-summary.test.js tests/speech-fidelity733.test.js`: 4 tests, exit 0.
- `node tests/translation-review-surface.test.js`: 15 checks, exit 0.
- `node tests/browser-youtube-whisper.test.js`: exit 0, protocol/reuse/range/race/stop assertions.
- Python compile for changed speech modules/tests, renderer Node syntax, `git diff --check`: exit 0.

Initial sandbox Python attempts stalled in `tempfile._mkstemp_inner` when atomic cache writer attempted Windows temporary writes; captured faulthandler identified it, stopped own test processes. Controlled suites then completed under approved unsandboxed test commands in <3 seconds each. Initial default Node test worker failed `spawn EPERM`; in-process Node runner/direct scripts completed. These environment failures are not product bugs. Initial expanded-risk fixture failures were fixed by implementing controlled role responses and checking the added call; final suites above passed.

## Limits / dependencies

No external source imported, no dependency/license/installation change. Existing mechanisms were sufficient; no external recommendation or API claim required. No live provider, GPU, listening-quality AB, human preference, native UI/start.bat or full CI verification performed by this agent. Parent owns integration/live verification. English source role rereading remains bounded heuristic eligibility, not semantic proof; ordinary fallback retains drafts and warns if independent role service fails. Existing numeric/negation/modal/ownership protections not weakened. No personal profile/keys used. No model-generated result was called live quality evidence.
