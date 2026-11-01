# Independent native Q01/Q05 acceptance — R829

Test owner changed **only** new `tests/electron-dub-preflight829.smoke.js`; parent owns the product edits in dub-experience-model.js, dub-experience-ui.js and dub-generator-ui.js. No production/model/network request was started. The fixture uses the actual Windows Electron renderer, preload and DOM event wiring with controlled main-process plan/config/dictionary IPC, isolated temporary profile and a synthesized 3-group plan. Actual subtitle parsing, ASR, naturalness, model speech or pronunciation audio quality are outside this acceptance.

## Result

**PASS, exit 0** via primary Windows Electron and `Start-Process -WindowStyle Hidden -Wait`. Output: `tmp/quality829/preflight-native-1793522397868/`; machine-readable `evidence.json`, four actual native screenshots. Expected adblock warning says fixture network disabled; it is not a tested flow failure. `dub:start` IPC count stayed **0 throughout**. Dictionary Save IPC count stayed **0 until the explicit Save test**, then became exactly **1**, with the edited Newton pronunciation in the request. No real engine/reference or account used.

- Before any output or generation, selecting the fixture SRT makes Review & repair visible and Inspect script enabled. Actual inspect button runs the new preflight against the native IPC plan.
- Three groups show two advisory text checks: long English source-language residue and U+FFFD damaged text. Advisory / no automatic change / unmeasured-reference wording is visible; no completeness or naturalness guarantee.
- Thomas and Newton repeated in two groups each appear as candidates, labelled as candidates rather than guessed phonetics.
- Prepare editable pronunciation draft preserves existing `KeepMe = Kipmi` and edited `Thomas = Tamıs`, adds `Newton = Newton` once, opens/focuses the real textarea, and does not persist anything. Source-scoped dictionary choice is unchanged.
- Compared before/after JSON of media owner/context, SRT, grouping, sample-only, timing mode, voice profile, active reference and dictionary scope: identical after inspection/draft, except intended textarea draft. The test does not change user defaults or source settings.
- Wrong-owner/wrong-SRT direct draft requests return false. Changing actual selected SRT then invoking the older report's draft button leaves the new draft unchanged and sends no Save IPC.
- A deliberately delayed native plan is released after actual media owner A→B and generation change. The old report does not repopulate the new owner's preflight; its list stays cleared/hidden, and the old draft ownership is rejected. No production or Save call occurs.
- Native Tab from Inspect script reaches Compare translations; preparing draft places focus in pronunciation textarea. Keyboard focus remains visibly amber in the capture.
- Dialog and inner scroller have no horizontal overflow; footer remains within the viewport and the content scroller ends above it, at EN1440 dark/100% and TR820 dark/125%. No cropped action footer. The TR viewport has less CSS width due to 125% zoom, as intended.

## Native screenshots

All are unedited full captures from `preflight-native-1793522397868/`:

- `en-1440-inspect.png`: English before-production review, both text warnings and repeated-name candidates; footer visible.
- `en-1440-draft.png`: English editable draft and source-scoped save affordance, no implicit persistence.
- `tr-820-inspect.png`: Turkish/820px at125%, advisory review and footer remain usable.
- `tr-820-draft.png`: Turkish/820px at125%, preserved draft/candidate, explicit draft warning, focus and footer.

The previous successful run's EN inspection/TR draft were visually inspected; the final rerun uses the same UI sequence and adds the asynchronous owner guard. Parent may inspect final captures directly. Test source syntax and scoped diff-check pass. This does not exercise start.bat/CUDA/DRM or live TTS; parent owns those integration claims.

Final rerun after parent tightened inspectedSource/report clearing on SRT and owner change: exit0, same four captures and all safety/layout assertions pass. No model/network/synthesis run.
