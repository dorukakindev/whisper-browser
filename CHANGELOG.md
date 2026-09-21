# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- SmartTube section: zero-config sign-in via YouTube TV device-code flow with QR code, matching the SmartTube TV experience (#9).
- SmartTube queue rail on the home grid with local continue/most-played rails (#9).
- InnerTube `lockupViewModel` card parsing for signed-in personalized feeds (#11).
- Real-UI screenshot gallery and a short English-captioned product tour.
- Public support routing, a project code of conduct, and private security-report links.
- English, screenshot-led usage guide covering local files, YouTube source mode, browser caption capture, contextual subtitle translation, page/manga/PDF workflows, and review boundaries.
- Current-documentation index and isolated-profile screenshot of separate subtitle and manga provider settings.

### Changed

- Reorganized public documentation in English.
- Anonymized machine-specific path examples in tracked audit documentation.

### Fixed

- SmartTube home no longer renders blank on feed errors; a local-rails fallback with sign-in and retry actions is shown instead (#11).
- Queue auto-advance and the Next button now resume a partially watched video from its saved position instead of restarting it (#8).
- SmartTube overlay re-opens after a failed card probe instead of leaving a black stage (#7).
- Refined translation revisions now reach the preview for blocks sharing the same timestamp (#5).
- The player Next button refreshes correctly on queue toggles and media transitions (#2).
- Repository, privacy, CI runtime, licensing, and security metadata corrections.

## [0.9.0-beta.1] - 2026-09-15

Initial public beta baseline. The older v1.1-browser-hardening tag is a historical checkpoint, not a stable semantic-version release.
