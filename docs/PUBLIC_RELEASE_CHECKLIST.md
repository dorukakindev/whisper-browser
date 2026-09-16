# Public Release Checklist

The repository is already public. This list now tracks outstanding publication and release checks; unchecked items must not be presented as completed. If a credential or private user record is found in published history, revoke or rotate it promptly and assess the exposure before editing history.

- [ ] Scan the complete Git history for credentials, private URLs, personal paths, browser data, and copyrighted media.
- [ ] Remove or rewrite sensitive history; deleting only the current file is insufficient.
- [ ] Decide whether historical audit and handoff records belong in the public repository.
- [ ] Run npm ci --ignore-scripts and npm test on a clean clone.
- [ ] Build and smoke-test a Windows artifact from a clean environment.
- [ ] Verify every bundled dependency license in the produced artifact.
- [ ] Enable GitHub private vulnerability reporting and branch protection.
- [ ] Review historical GitHub Actions logs before changing visibility.
- [ ] Create a current beta tag and release notes; treat v1.1-browser-hardening as historical.
- [x] Add representative product screenshots that contain no personal data. The current README also links to a credited real-video tour; review the media again before each release.
- [x] Set an English repository description and discoverability topics; verify them through GitHub's public repository API.

GitHub exposes code, history, Actions logs, and repository metadata. A clean current tree is necessary but not sufficient. Do not rewrite published history or force-push without an explicit migration and incident plan.
