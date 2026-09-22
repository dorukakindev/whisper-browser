# Installation

## Windows (supported production target)

Install Git, Node.js 22.13+, Python 3.10 or 3.11, and FFmpeg, then run:

    install.bat
    start.bat

The installer verifies tools and lock files, stages and checks the Python environment, installs locked Node packages, and installs the pinned Castlabs Electron runtime. Use start.bat, not bare npm start, because it configures CUDA library paths.

Optional components:

    install-whisperx.bat
    install-diarize.bat

## Ubuntu / Linux (development and test)

Install Git, Node.js 22.13+, Python 3.10 or 3.11, and FFmpeg, then run:

    ./install.sh
    ./start.sh

`install.sh` runs the same `tools/install-orchestrator.js` lock-verified install as `install.bat` (venv staging, pinned Node packages, pinned Castlabs Electron binary). `start.sh` exports the equivalent `LD_LIBRARY_PATH` for the pip-installed cuDNN/cuBLAS packages. Optional WhisperX/diarize profiles accept the profile name as an argument (`./install.sh whisperx`); they are only verified on Windows.

Honest limits on Linux: DRM-protected playback signing (Castlabs EVS VMP via `drm-kur.bat`) is Windows-only — protected services such as Discovery+/Hulu are not supported on Linux. CUDA-tuned transcription is verified on Windows; on Linux it depends on the local NVIDIA driver stack. `safeStorage` secrets persist only when a Secret Service daemon is available. macOS is not a supported target.

## Tests only

`npm ci --ignore-scripts` does not run the Electron postinstall; fetch the pinned binary explicitly (same step the installer uses):

    node node_modules/electron/install.js --no

`npm test` also runs `backend/test_*.py`; give it an interpreter via `backend/venv` or `WHISPER_TEST_PYTHON`. `backend/requirements-ci.txt` is pinned for Python 3.11 (matching CI); production install supports 3.10–3.11.

Do not commit environments, models, profiles, logs, caches, or generated media.
