# Optional media engines and source provenance

The application uses its existing Chromium/HLS player by default. No new npm or Python dependency is required for the optional adapters below.

## rqbit

- Upstream: https://github.com/ikatson/rqbit
- Version pinned by the Windows installer: **9.0.1**.
- Download: https://github.com/ikatson/rqbit/releases/download/v9.0.1/rqbit.exe
- SHA-256: `2ed683203beca628e0c45f62f99feeef4242cecc3444c8422dfe5b1b6aa38cea`.
- Copyright 2021 Igor Katson. Licensed under Apache-2.0: https://github.com/ikatson/rqbit/blob/v9.0.1/LICENSE .
- The executable is downloaded directly from its official release when the user chooses **Open media → Torrents → Download engine**. It is not committed to this repository or bundled into the source delivery.
- The main process launches the CLI and communicates with a loopback-only authenticated HTTP API. Renderer pages receive only an opaque read-only media URL. Keys for AI providers are removed from the child environment.
- The main process checks the pinned digest before running the executable. Updating to another version requires reviewing both its digest and HTTP contract.

## mpv

- Upstream and manual: https://mpv.io/ and https://mpv.io/manual/stable/ .
- A separately installed, trusted **mpv.exe** is required. The application can locate an existing Luna Player installation or use the explicit native executable picker.
- The chosen executable remains in its original installation. This delivery does not redistribute mpv, its codecs, or Luna binaries; their own distribution/license terms continue to apply.
- On Windows, a dedicated host window embeds mpv using `--wid`; control uses a private named pipe. User mpv configuration and scripts are disabled for this session. Existing application controls and subtitle/dubbing state are reused.
- Tested installed binary: `mpv v0.41.0-1151-g9d144e57b`, built 2026-10-13. This is a tested installation, not a forced upgrade or a minimum-version guarantee.

## Luna comparison

Luna Player beta **v1.6.7**, source commit `3c4ae8f55ae792e9abe43fb9c3cf67c506b61bd6`, was inspected for taste/review, torrent and native-player workflows. These JavaScript/Python adapters are original implementations against our existing services and upstream engine protocols. Luna source code and binaries were not copied into product files. Earlier pinned font and Defuddle notices remain applicable.
