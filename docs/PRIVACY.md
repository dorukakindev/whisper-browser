# Privacy and network access

Whisper Browser is local-first, not offline-only. Transcription, parsing, timing, editing, search, and most diagnostics run locally.

Network access occurs when users browse sites, retrieve YouTube media, download models, call configured translation/OCR/chat providers, query selected metadata services such as OpenSubtitles, TMDB, or SponsorBlock, or update filters and tools. Provider policies apply to text, image regions, context, or questions sent to them.

Settings, browser state, history, logs, and caches are local and may contain paths or media titles. The persistent browser profile may contain cookies and site storage; never publish it.

Secrets are not placed in process arguments. Supported credentials use the application secret store and Electron safeStorage when OS protection is available. Inspect exports before sharing them. Never post keys, cookies, headers, signed URLs, private subtitles, or browser profiles.
