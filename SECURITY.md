# Security Policy

Whisper Browser is beta. Security fixes target the default branch; old tags are not guaranteed backports.

Do not open public issues for vulnerabilities involving credentials, browser sessions, local files, or remote users. Use GitHub private vulnerability reporting when available, otherwise contact the owner privately through GitHub.

Provide a minimal synthetic reproduction, affected commit, impact, and mitigation. Never send real keys, cookies, signed URLs, subtitles, or profiles. Relevant scope includes Electron IPC, file authorization, secret storage, diagnostic redaction, session isolation, installation, and subprocess arguments. DRM bypass is out of scope.
