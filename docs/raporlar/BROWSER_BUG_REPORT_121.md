# BROWSER_BUG_REPORT_121 — Uncommitted worktree triage (no product fix)

Date: 2026-09-24. Current product commit: `8a5410f85c9af0c6d2641b7841321348d6b795ae`. Scope: the 18 registered local Git worktrees and the user's “18 uncommitted files” branch-switch warning. This is a read-only product audit: no worktree content was moved, stashed, cleaned, or reset.

## Findings

1. The active `codex/catalog-sync` checkout has **no tracked modifications**. Its 18 top-level untracked paths expand to 70 files, including old program/browser reports, historical handoff notes, `_repro` scripts/screenshots, `tests/r92-deep`, `.freebuff`, and a commit-message draft. `docs/BROWSER_BUG_REPORT_70.md` labels itself an accidentally created draft. None is required to reproduce the current product code. They are user-owned local artifacts, not a ready-made patch for `master`.
2. The detached September 12 worktree `C:/Users/K/.codex/worktrees/76f7/Whisper Local` has 54 tracked modified files. Content-address comparison against current `master` found 17 identical current blobs and 37 blobs already present somewhere in `master` history; **zero novel tracked file blobs**. Its 47,277 total status entries are overwhelmingly under `scratch/` (over 47,000). Bulk “Bring changes” would reintroduce old versions and potentially stage generated files.
3. The detached September 8 worktree `C:/Users/K/.codex/worktrees/ac35/Whisper Local` has three tracked modifications. Two whole-file blobs are in `master` history. The third (`src/renderer/renderer.js`) is a different whole-file revision, but its actual two-line change—showing `result.persistenceWarning` from zoom persistence—is already present in current `master` at `changeBrowserZoom`. It is not missing functionality.
4. One Claude worktree has an untracked `.claude/launch.json`; an older scratch worktree has generated UI-audit screenshots/report. Other registered worktrees had no reported changes. These are not product patches.
5. Historical [R89](BROWSER_BUG_REPORT_89.md) already re-evaluated the local `PROGRAM_BUG_REPORT_83–85` and four R92/R93 probe files; multiple red probe results were invalid assumptions, while verified fixes were delivered. Later handoff notes explicitly left those local files outside commits. Re-adding them as current tests or bugs would misrepresent their status.

## Decision and limits

**Do not bring or stash all files merely to switch branches.** Cancel that dialog; use explicit, per-file selection only if a new need is proven. No product-code change is justified by this inventory, so no product tests were run. This audit does not delete or declare the local artifacts worthless: a historical document can be archived separately after content/privacy review, but that is different from integrating a needed fix. No personal profile, keys, or generated scratch-file contents were read.
