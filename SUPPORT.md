# Support

Whisper Browser is a community-maintained beta project. There is no guaranteed response time or commercial support agreement.

## Before asking for help

1. Read the [installation guide](docs/INSTALLATION.md) and [troubleshooting guide](docs/TROUBLESHOOTING.md).
2. Confirm that you are using Windows 10 or 11, Node.js 22.13 or newer, Python 3.10 or 3.11, and a working FFmpeg installation.
3. Start the application with `start.bat`; launching Electron directly does not configure the CUDA runtime paths used by the local transcription backend.
4. Reproduce the issue on the latest `master` commit with a non-private media sample when possible.

## Where to ask

- Use a [bug report](https://github.com/dorukakindev/whisper-browser/issues/new?template=hata-bildirimi.md) for reproducible incorrect behavior.
- Use a [feature request](https://github.com/dorukakindev/whisper-browser/issues/new?template=ozellik-onerisi.md) for a focused product proposal.
- Use [GitHub private vulnerability reporting](https://github.com/dorukakindev/whisper-browser/security/advisories/new) for security issues involving credentials, browser sessions, local files, or remote users.

## Privacy checklist

Never attach real API keys, cookies, authorization headers, signed media URLs, private subtitles, browser profiles, or unredacted diagnostics. Replace local paths with placeholders such as `%USERPROFILE%\Videos\sample.mp4`. A minimal synthetic reproduction is preferred.

DRM bypass, account sharing, and extraction of data hidden inside a CDM are outside the project scope.
