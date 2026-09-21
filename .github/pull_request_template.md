## What

<!-- Concise summary of the change in 1-3 sentences. -->

## Why

<!-- Problem statement and user impact. Link the issue/report that motivated it. -->

## How

<!-- Bulleted implementation outline; feature flags, config, migrations. -->

## Tests

- [ ] Focused regression tests added/updated
- [ ] `npm test` passes
- [ ] Manual/Exploratory: <!-- steps + result -->

## Risks / Rollback

<!-- Known risks and mitigations; rollback steps (revert commit, flag off). -->

## Screenshots / Media

<!-- Required for UI changes. No secrets or personal data. -->

## Links

<!-- Closes #123; design docs; related PRs. -->

## Release Notes

<!-- One-line user-facing summary for CHANGELOG.md. Update the Unreleased section. -->

---
**Checklist**

- [ ] Single scope, reasonable size (large PRs explain the split plan)
- [ ] `CHANGELOG.md` updated for user-visible changes
- [ ] User-facing application text remains Turkish (EN/TR both provided for new strings)
- [ ] Backend contracts synchronized where applicable (argparse ↔ main.js ↔ renderer.js ↔ index.html)
- [ ] No secret in argv, logs, fixtures, or source control
- [ ] Privacy and license notices updated when needed
