# UI surface coverage

`node tools/audit-ui.mjs --inventory-only --out tmp/ui-inventory` writes declared static roots from index, assistant overlay and mini-browser without requiring a browser. It records zero rendered visits; inventory is not a successful visual audit.

Normal audit runs write `report.json` plus `coverage.json`. Each visible declared root inside a captured scope links to locale, theme, width and screenshot. Missing/invisible preparations are blocked rather than successful empty contrast checks. Separate-window roots and unvisited static roots remain explicit. Runtime dialogs without a declared `data-ui-surface` are not claimed as inventoried.

`--coverage-strict` exits 1 while any declared root remains unvisited. This is separate from the established `--strict` contrast gate. A missing browser exits 2 and still writes the blocked coverage inventory. `--surface` intentionally limits the run; it does not imply full coverage. All selected preparers now run at every requested width, not only 1400px.

Native Electron tests remain necessary for the assistant overlay, native browser surfaces, focus and occlusion. A screenshot of one state does not establish other states or the full locale/theme/width matrix. The coverage file contains actual evidence states so gaps can be inspected. No flag turns missing evidence into success.

Capture evidence must exist and decode as a PNG with valid CRCs. Empty, missing,
corrupt, oversized (>32 MiB) or excessive-dimension (>16 megapixel) files are
listed in `blockedArtifacts` and cannot establish a visit. Each accepted capture
records its byte size, SHA-256 and pixel dimensions. Relative filenames resolve
against the audit output directory (`evidenceRoot` for direct `summarize` callers).
Repeated capture hashes are listed in `duplicateCaptures`; this is diagnostic,
since a single legitimate screenshot can cover multiple nested declared roots.
`--coverage-strict` also fails when invalid capture artifacts exist. PNG decoding
uses the existing locked pngjs 5.0.0 package, now an explicit dev dependency.
