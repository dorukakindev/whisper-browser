# Public History Audit — 2026-09-20

Scope: every added text line reachable from every Git ref, scanned by
`npm run audit:public-history`. The scanner reports metadata only and never
prints candidate secret values.

## Result

- Credential/secret findings: **0**.
- Personal-path warnings: **5** historical documentation examples.
- Binary/media leak found by the text scanner: **none**.
- History rewrite required: **no**. No credential or private browser record was
  found, so rewriting already-published Git history would create more risk than
  it removes.

The five warnings are documentation evidence: two synthetic redaction examples,
one generic AppData placeholder, one configured `Downloads/Whisper` location,
and one historical subtitle filename. They expose the single-letter Windows
profile name `K`, but no token, password, browser profile, cookie, media body, or
subtitle contents. They remain as dated engineering records under the policy in
`docs/HISTORICAL_RECORDS.md`.

## Repeatable gate

```powershell
npm run audit:public-history
```

Any future secret finding blocks a release. Rotate/revoke the credential first;
history rewriting is an incident response decision, never an automatic cleanup.

