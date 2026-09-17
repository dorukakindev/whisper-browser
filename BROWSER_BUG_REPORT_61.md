# BROWSER BUG REPORT 61 — Report 60 boundary repair record

**Date:** 2026-09-18

**Repository:** `dorukakindev/whisper-browser`

**Branch:** `master`

**Base commit:** `d4ec4f8117f1769e5fa229cf1b6535104ce642c2`
(report 60 independent-check record)

**Mode:** repair — failing regression test first, then the smallest owning
change, then targeted and full-suite verification.

## Scope

`BROWSER_BUG_REPORT_60.md` confirmed 14 of the 15 report-58 repairs and
left one confirmed open boundary:

> **R58-14 is not fully closed.** `apply_piecewise()` sorted cues and
> shortened each end to `max(start + 0.01, next_start - min_gap)`. When two
> transformed cues share the same start, the minimum-duration floor defeats
> the no-overlap rule and compresses a multi-second cue to 10 ms.

## Reproduction (verified on the base commit)

```powershell
& 'backend/venv/Scripts/python.exe' -c "import sys; sys.path.insert(0,'backend'); import transcribe as t; print(t.apply_piecewise([(0,2,'first'),(2,4,'second')],[(0,0,2),(1,1,0)]))"
```

Base-commit output: `[(2.0, 2.01, 'first'), (2.0, 4.0, 'second')]` —
overlapping cues and a 10 ms unreadable first line.

## Fix

`backend/transcribe.py` `apply_piecewise()` now takes a `min_cue_dur=0.3`
parameter. When a boundary truncation (`e > next_start - min_gap`) would
leave a cue shorter than the readable floor — which includes the
equal-start case (`ceiling <= start`) — the function returns `None`
instead of emitting an overlapping or unreadable cue.

`sync_subtitles()` treats `None` as an infeasible piecewise mapping: it
appends an explicit warning ("Parçalı hizalama sınırda çakışan/okunamaz cue
üretti; güvenli sabit kayma kullanıldı — sonucu kontrol edin.") and falls
back to the global-offset `shift_srt_entries` path. This matches report
60's acceptance: reject the piecewise candidate or fall back to a safer
alignment with an explicit warning, rather than sort-and-crush to 10 ms.

Truncations that still leave a readable duration keep the existing repair
(ceiling at `next_start - min_gap`), so the report-58 ordering invariants
are preserved.

## Regression coverage

`backend/test_transcribe.py`
`test_r58_apply_piecewise_equal_start_returns_none_instead_of_10ms_crush`:

- the exact report-60 reproduction returns `None` (previously produced
  `[(2.0, 2.01, 'first'), (2.0, 4.0, 'second')]`);
- a feasible opposing-offset boundary still truncates correctly with
  readable durations and the `min_gap` contract intact.

## Verification performed

- `backend/venv/Scripts/python.exe backend/test_transcribe.py` —
  **191 passed, 0 failed** (new boundary test included).
- `backend/venv/Scripts/python.exe -m py_compile backend/transcribe.py` —
  clean.
- `npm test` — **Tüm testler geçti** (full suite green in this
  environment; report 60's `spawn EPERM` failures were environment-
  specific and did not reproduce here).
- Report 60's note about unverified remote-push equality is addressed:
  this repair was pushed and `git ls-remote origin refs/heads/master`
  matched the local HEAD (see handoff note).

## Evidence limits

- Verified deterministically at the function level plus caller fallback;
  a real `.synced.srt` run on adversarial media was not exercised.
- `apply_piecewise` returning `None` is a new contract; the sole call site
  (`sync_subtitles`) handles it. No other caller exists.
