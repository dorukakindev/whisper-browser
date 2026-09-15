# Architecture

src/main.js owns trusted Electron services, file authorization, browser sessions, and subprocesses. src/preload.js exposes a narrow contextBridge API. src/renderer/ contains the sandboxed Turkish UI; renderer Node integration is disabled.

backend/transcribe.py emits newline-delimited JSON events. New backend options normally require synchronized Python, main-process, renderer, and HTML changes. Secrets use environment variables and the secret store, never argv.

The subtitle pipeline performs media extraction, inference, filtering, segmentation, optional post-processing or diarization, timing normalization, and atomic output writing. Browser capture uses separate HLS, DASH, TextTrack, and response paths with integrity diagnostics. Local file access is capability-based and browser content cannot invoke privileged IPC directly.
