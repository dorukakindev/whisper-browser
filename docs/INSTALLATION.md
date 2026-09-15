# Installation

Install Git, Node.js 22.13+, Python 3.10 or 3.11, and FFmpeg, then run:

    install.bat
    start.bat

The installer verifies tools and lock files, stages and checks the Python environment, installs locked Node packages, and installs the pinned Castlabs Electron runtime. Use start.bat, not bare npm start, because it configures CUDA library paths.

Optional components:

    install-whisperx.bat
    install-diarize.bat

For pure tests, npm ci --ignore-scripts is sufficient but does not install a runnable Castlabs binary. Do not commit environments, models, profiles, logs, caches, or generated media.
