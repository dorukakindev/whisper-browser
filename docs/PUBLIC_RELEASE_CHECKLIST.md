# Public Release Checklist

Do not change repository visibility until every item is complete.

- [ ] Scan the complete Git history for credentials, private URLs, personal paths, browser data, and copyrighted media.
- [ ] Remove or rewrite sensitive history; deleting only the current file is insufficient.
- [ ] Decide whether historical audit and handoff records belong in the public repository.
- [ ] Run npm ci --ignore-scripts and npm test on a clean clone.
- [ ] Build and smoke-test a Windows artifact from a clean environment.
- [ ] Verify every bundled dependency license in the produced artifact.
- [ ] Enable GitHub private vulnerability reporting and branch protection.
- [ ] Review historical GitHub Actions logs before changing visibility.
- [ ] Create a current beta tag and release notes; treat v1.1-browser-hardening as historical.
- [ ] Add representative product screenshots that contain no personal data.

GitHub can expose code, history, Actions logs, and existing repository metadata after a visibility change. A clean current tree is necessary but not sufficient.