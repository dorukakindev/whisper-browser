# R840 — Bounded current-code settings/subtitle IO pass

Snapshot HEAD f3713c9fe7855f9e9a92bab5fcf65e2d5a69a74d. Separate from recent-diff Standards review. No fixes, installations, profile/settings changes, live APIs, commit or push.

Reviewed main.js settings:export (20064 onward), settings:import (20116 onward), shiftTimecodes (20597 onward), subs:shift (20662 onward), backupOnce/writeSubtitleAtomic (2859 onward), settings-security.js sanitization/export/import and transaction boundaries. Read relevant Night1000 F18/F48/F50 signatures (registry-reviewed.json) and prior R29/R31/R42/R66/R251/R274/R301/R302/R451/R463/R480/R515/R815/R820/R833 report references before counting. Queue failures already in R833 were not rerun or counted.

Result: zero new verified bugs in this bounded pass. This is limited code inspection plus targeted existing tests, not whole-main-process correctness or real UI/OS fault acceptance.

Verification command:

`node --test --test-isolation=none tests/settings-roundtrip.test.js tests/subs-shift-accuracy.test.js`

Exit 0. Both test files passed. Their own existing assertion runners report 10 settings roundtrip controls and 12 subtitle shift controls; Node reports 2 file tests. Do not add these as 22 new bugs or scenarios. These are synthetic module/VM tests: export/import allowed-field fidelity and idempotence, endpoint credential inheritance, legacy backup/BOM handling, malformed shape rejection, 1000-seed subtitle timing oracle, CRLF, negative clipping, subtitle settings and +/-86400s boundaries. Native dialog, real installed settings secret store, OS interruption and actual start.bat are not proven.

Scope exclusions/rejected upgrades:

- R820 cue-header/inline WebVTT shift mismatch is existing recorded scope; not rediscovered as new.
- Fixed one-time .bak policy and SRT numbering after removing cues are existing implementation/documented behavior; R451 D-16 had the numbering suspicion. Neither became a new loss claim without a failing downstream consumer.
- The importer applies settings/browser transaction before watch-store and notes-store writes; a cross-store fault atomicity concern merits an explicit controlled acceptance experiment, but no new verified bug is claimed here because this bounded pass did not drive a real failing downstream store through the IPC path. A comment about transaction scope is not by itself proof of user data loss.
- Subtitle payload text resembling a timecode was not counted without proving valid input semantics and actual production consumer impact.
