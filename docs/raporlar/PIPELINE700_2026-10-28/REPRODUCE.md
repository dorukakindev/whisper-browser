# Opt-in synthetic pipeline acceptance

Requires Windows System.Speech, FFmpeg, backend Python with cached tiny/small models, installed VoxCPM2/nano-vLLM CUDA environment and model. Uses no paid API. Do not use a personal reference/profile. These probes are not part of default CI. Run in a dedicated writable fixture folder; do not point it at a folder containing user media. No automatic dependency download is performed.

1. Create `english.wav` in the fixture folder using System.Speech with: `The library is open today. We can read a book together.`
2. FFmpeg: `-f lavfi -i color=c=0x16181b:s=640x360:d=14 -i english.wav -af adelay=2000,apad -t 14 -c:v libx264 -pix_fmt yuv420p -c:a aac` → `Türkçe kaynak.mp4`.
3. Backend venv Python: `backend_acceptance.py <absolute-project-root> <absolute-fixture-folder>`. It binds a temporary loopback HTTP fixture provider, calls real transcribe.py and preserves backend.out/err/requests/result. Requests contain synthetic transcript only. Exit must be0 and done.translation1/1.
4. Put a clean synthetic SAPI `reference.wav` in fixture folder. Set `VOXCPM_ROOT` to installed engine. Engine venv Python: `tts_acceptance.py <project-root> <fixture-folder>`. This is a real GPU call, not a fixture. Reference and random model outputs may differ; hashes describe the recorded run, not an identical-output promise.
5. Backend venv Python: `verify.py <project-root> <fixture-folder>`. Independent local small/CPU ASR; read the expected/actual difference instead of treating exit0 as perfect speech.
6. Set `WHISPER_PIPELINE_TEST_DIR` to fixture folder and run installed Electron with `tests/electron-pipeline-source.smoke.js`. The native test creates a separate profile and second synthetic video, checks range/ownership and exits. It does not generate TTS itself.

Project-specific PowerShell paths may be supplied explicitly. Normal app startup remains start.bat; this isolated native test is not a launcher installation test. Recorded reference audio is not distributed; a new synthetic reference can change pronunciation/ASR results. Current run has an unresolved Kütüphane/Kötüphane ASR difference.
