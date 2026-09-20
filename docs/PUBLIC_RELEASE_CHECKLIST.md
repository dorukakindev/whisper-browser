# Public Release Checklist

The repository is already public. This list now tracks outstanding publication and release checks; unchecked items must not be presented as completed. If a credential or private user record is found in published history, revoke or rotate it promptly and assess the exposure before editing history.

- [x] Scan the complete Git history for credentials, private URLs, personal paths, browser data, and copyrighted media. See `docs/PUBLIC_HISTORY_AUDIT_2026-09-20.md`.
- [x] Decide whether history rewriting is required. It is not: the full scan found zero secrets; five low-sensitivity path warnings are documented rather than hidden with a risky force-push.
- [x] Decide whether historical audit and handoff records belong in the public repository. See `docs/HISTORICAL_RECORDS.md`; they are dated evidence, not current truth.
- [x] Run npm ci --ignore-scripts and npm test on clean GitHub runners. [CI run 35531298678](https://github.com/dorukakindev/whisper-browser/actions/runs/35531298678) passed on Windows and Ubuntu; the same code also passed the full local suite.
- [x] Build and smoke-test a Windows artifact. `package:win` produced a 487.5 MiB unpacked app and `smoke:package:win` kept it healthy for six seconds. The package intentionally requires `install.bat` for Python/GPU runtime setup on a new machine.
- [x] Verify every bundled dependency license in the produced artifact. `audit:licenses` found only Apache-2.0, BSD-2-Clause, ISC, MIT, and MPL-2.0; production lock copyleft findings: 0.
- [x] Enable GitHub private vulnerability reporting and branch protection. `master` requires the Windows and Ubuntu test jobs, blocks force-push/deletion, and requires resolved conversations.
- [x] Review the latest pre-release GitHub Actions failure. It contained cross-platform test-runtime gaps, not product regressions or printed credentials; the paths and dependency setup are now explicit in CI. Older public logs remain covered by the no-secret history policy and must be rechecked if a credential incident is reported.
- [ ] Create a current beta tag and release notes; treat v1.1-browser-hardening as historical.
- [x] Add representative product screenshots that contain no personal data. The current README also links to a credited real-video tour; review the media again before each release.
- [x] Set an English repository description and discoverability topics; verify them through GitHub's public repository API.

GitHub exposes code, history, Actions logs, and repository metadata. A clean current tree is necessary but not sufficient. Do not rewrite published history or force-push without an explicit migration and incident plan.
