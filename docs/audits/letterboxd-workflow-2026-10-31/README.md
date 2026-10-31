# Letterboxd workflow and retained advanced controls — 2026-10-31

Base: `25a7d912bfb04447db45c66d29297983452c366c`; branch `codex/letterboxd-workflow`.

## Delivered behavior

- Discovery titles can bring a loaded Letterboxd review page back from Browser without first creating a library item. Fresh discovery identity and current title/year/provider IDs are checked; obsolete handoffs are rejected.
- Automatic review loading supports activity, newest, highest rated, lowest rated and a balanced sample from all four lists. Requests stay bounded to four pages, with same-film/sort redirect checks. Balanced sampling is not a representative survey; rating is not a sentiment label.
- Canonical author identity, original permalink/date/rating and source sort/page survive parsing, preview and save. Repeated authors/text are not independent evidence. Unknown authors are shown separately; partial coverage remains explicit.
- One long review no longer consumes the complete prompt budget before later sources receive a readable prefix. The preview and send/save use the same bounded selected text.
- Optional Turkish explanations are visibly identified as AI paraphrases, beside the exact original quotation. Exact source correspondence remains mandatory; this does not verify the truth of an opinion or the translation quality.
- Personal fit includes explicit preferences/questionnaire choices and accepted personal insights only with matching personal-review quotations. An expired or changed profile/sample marks saved analysis as earlier context. An old analysis with no snapshot shows unknown freshness.
- Previously saved samples can be reused locally without another fetch or AI request. Profile/sample edits between preview and send, or another assistant job starting during the awaited recheck, prevent a stale/concurrent send.
- The simple review view keeps the two main source actions prominent. **Advanced · sources & review options** retains URL, loaded Browser page, public fetch, TXT/JSON import, append-page, editor and spoiler controls. The disclosure choice is retained for the current draft; automatic-source errors reveal manual controls. Original/full text, inclusion decisions and personal context remain inspectable.
- Floating Assistant source labels now explicitly mention the model. Its source disclosure links to the existing Assistant & translation settings via the source-owned native command boundary. No key or setting value is sent through this action; opening does not save settings or start a job.

## Verification

Native Windows acceptance: `acceptance.json`, exit 0. Real Electron app, parser/service/IPC, Browser handoff, selection/save/history and actual assistant settings shortcut. Review HTML, discovery identity and completed analysis are controlled fixtures; no personal profile and no external review/model calls in that test.

- Discovery without catalog insertion; balanced 12-row/four-pool source selection.
- Exact original plus labeled paraphrase; native save and history.
- Profile change becomes stale; wrong-title import keeps the existing sample.
- Review quote/history screenshots in TR/EN at 1280 dark and 720 light.
- Real assistant disclosure → existing settings opening at normal/narrow widths.
- Screenshot inspection covered spacing, wrapping, source detail visibility and reachable settings controls, in addition to overflow checks. These are not an all-application visual review.

Live DeepInfra: `deepseek-synthetic-results.json`; standard tier, model `deepseek-ai/DeepSeek-V4.1-Flash-1017`. Two HTTP 200 direct requests use the actual production prompt and shared evidence/quote validators with synthetic reviews: explicit preferences, then five texts from a single author without profile. All ten returned quotations match supplied original text. The second answer explicitly rejects treating those texts as five independent opinions and does not invent personal preferences. This is a two-case prompt/contract check, not a general taste-prediction or end-to-end provider reliability claim. No personal review corpus was sent.

Focused suites cover disclosure persistence/recovery, stale context, post-await races, exact quotes, source metadata, discovery handoffs, bounded sampling and native/renderer validation. Full run: 730 Node files and 171 Python files; exit 1 solely because the added disclosure test used setTimeout(0), prohibited by ci-determinism-ratchet. The test was corrected to await its actual toggle event, with no baseline/assertion changes. All 60 relevant tests including that guard then passed (exit 0). Product source was stable during the full run and unchanged by this harness correction. The entire suite was not repeated after the test-only correction; see validation.json. This is not a claim that the full runner subsequently returned exit 0.

## Website and Luna limitations

Primary navigation checked at:
- https://letterboxd.com/film/inception/reviews/
- https://letterboxd.com/film/inception/reviews/by/activity/
- https://letterboxd.com/film/inception/reviews/by/entry-rating-lowest/

These establish real sort routes; they do not prove universal unauthenticated fetch access. Direct public fetch returned HTTP 403. Normal loaded Browser extraction, manual paste and import remain available; no challenge bypass or authentication scraping was added.

Installed Luna Player executable reports **3.4.1** and includes Inter font assets. Two screenshot capture attempts timed out, including a fresh-window recovery. Current beta source/ref could not be verified (live repository access returned unavailable). Do not treat README/design-skill patterns as rendered Luna comparisons or claim feature parity. Existing Whisper theme controls, typography and colors were reused; no new palette, motion library or generated art was introduced.

Inspection also confirmed existing advanced production disclosures in dubbing and voice/settings access via the book editor. Those screens were not redesigned in this delivery. The project rule `progressive-detail-design.mdc` records the user's application-wide preference; it is not evidence that all screens were retested.

## Reproduce

From the repository root on Windows:

```powershell
node --test --test-isolation=none tests/review-workflow.test.js tests/review-analysis-contract.test.js tests/letterboxd-sampling-critical.test.js tests/review-discovery-handoff.test.js tests/assistant-conversation.test.js tests/assistant-overlay.test.js
node tests/run-electron-smokes.js letterboxd-evidence
$env:WHISPER_TEST_PYTHON = 'D:\Whisper Local\backend\venv\Scripts\python.exe'
$env:PYTHONUTF8 = '1'
node tests/run-all.js
```

The native smoke creates its own temporary profile and controlled HTML/provider completion, never the user's real profile. Model quality, GPU generation, real Letterboxd access under every session and a complete Luna comparison remain outside this acceptance.
