# Contributing

Whisper Browser targets Windows, has a Turkish UI, and combines Electron with Python. Run install.bat for a complete environment and start.bat to launch.

Before a pull request, run focused tests plus:

    npm test
    node --check src/main.js
    node --check src/preload.js
    node --check src/renderer/renderer.js
    python -m py_compile backend/transcribe.py backend/media.py

Use npm run test:electron-bridge for IPC/browser changes. Document checks not run. Keep user-facing text Turkish, preserve context isolation, validate privileged IPC, synchronize backend option contracts, keep secrets out of argv/logs, preserve cue identity/timing, use atomic subtitle writes, and add regression tests.

Do not commit media, models, keys, logs, profiles, generated output, or personal audit data.

By participating, you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md). For setup questions and issue-routing guidance, see [Support](SUPPORT.md). Security-sensitive reports must follow [SECURITY.md](SECURITY.md) and must not be posted as public issues.
