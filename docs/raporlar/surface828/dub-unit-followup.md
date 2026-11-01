# Dubbing unit fixture follow-up

Baseline investigation: production pronunciation API now supports array payloads for global dictionary and {action:get|save,srt,source,entries?} for the source dictionary (renderer dub-generator-ui.js and main dub-service.js lines401+). Default scope is source; Save is intentionally disabled until subtitles are selected. The old test tried clicking disabled source Save before choosing SRT, then read savedDictionary[0]. Its fixture additionally assumed every payload was a global entries array. This is a stale fixture/setup failure, not a product regression caused by the startup layout line.

To prove independence without touching production code, created tmp/surface828/dub-baseline.cjs. Its process-local fs.readFileSync shim changes only the renderer source string from inputColumn.append(sourceCard) back to old inputColumn.append(sourceCard,modal.querySelector('.dub-natural-card')). Original unit test under that shim failed identically with TypeError reading index0 at tests/dub-generator-ui.test.js:30 and process exit1.

Changed ONLY tests/dub-generator-ui.test.js: fixture models both current pronunciation API shapes, config exposes the persisted global dictionary; original global save assertion is retained by explicitly selecting Global scope. Added assertions that source Save waits for SRT, source editor does not copy global entries, source Newton pronunciation can override global Newton while the global dictionary remains intact, and switching scopes restores each saved value. All remaining existing workflow assertions retained.

Commands/results:
- Before fixture fix: node tmp/surface828/dub-baseline.cjs → exit1, same savedDictionary[0] failure with old layout source injected only in-process.
- After fix: node tests/dub-generator-ui.test.js → exit0, selected background range, confirmed stop and failed stop passed.
- After fix: node tmp/surface828/dub-baseline.cjs → exit0 as well, confirming fixture works with both layout source variants.
- node --check tests/dub-generator-ui.test.js → exit0.
- git diff --check -- tests/dub-generator-ui.test.js → exit0.

No production JS edited by this follow-up. No full suite, GPU or provider calls run. Existing async IIFE correctly sets process.exitCode=1 on failure; a synchronous parent require-runner can print its own pass before that promise settles, so child-process exit code is the meaningful result.
