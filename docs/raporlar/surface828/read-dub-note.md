# Surface828 — dubbing and PDF reader craft

## Spatial thesis and incumbent evidence

Operate: subtitles → reference voice → production; keep setup controls together, optional production below, and the persistent job footer outside the one main scroller. Read: keep the book title, page/view navigation and narration actions in a compact tool family; the prose receives the vertical budget and its existing preferred measure.

Reviewed actual R827 native evidence in docs/raporlar/theme827/after/dub.png, dub-narrow.png, reader.png, reader-narrow.png. Confirmed two concrete craft defects: narrow dubbing exposed advanced production ahead of reference voice, and reader prose started after excessive cumulative outer/inner top padding. Dubbing also stacked recorder, results and project frames inside parent frames.

## Changes

- dub-natural.css: 16px setup gap, active voice closer to its heading, full-width neutral production section after setup, recorder/results/project/music disclosures use separators rather than nested frames. No feature/copy/palette/font changes. Source names can wrap safely.
- Parent-owned dub-generator-ui.js one-line startup fix keeps only source in .dub-input-column; original voice → natural production DOM order remains intact. This avoids CSS visual reordering and preserves matching keyboard order.
- pdf-reader.css: grouped page navigation with thin separators and 8px utility radii; secondary hover uses shared neutral tokens. Reading top whitespace reduced from outer32+inner~58 to outer24+inner24 at wide viewport, keeping user width/font/leading preferences. Menus retain their current owners and actions.
- electron-dub-natural.smoke.js: verifies source-only wrapper, source→voice→production DOM order and production below voice, plus actual Tab from recorder summary to advanced production summary. Added light ready captures at all three existing widths.

## Native verification

All launches used D:/Whisper Local/node_modules/electron/dist/electron.exe via Start-Process -WindowStyle Hidden, isolated test profiles, disable-gpu and controlled fixtures. No user app was stopped. First sandboxed launch exited without captures; escalated launches worked.

- Full dubbing smoke PASS, 20 capture/state records: .uiprev/dub-natural-1793518983268/acceptance.json. TR1440, TR820, EN640; dark/light ready, focus, active, review, pronunciation states; preserved source/voice/range/settings and fixed footer checks; native Tab transition passed.
- Full PDF experience smoke PASS: .uiprev/pdf-reader678-1793518890905/results.json ok:true. Real fixture PDF extraction, page and view navigation, selection/assistant context, reading preferences, narration range, inline audio follow/zoom preservation, source/translation modes and close/return exercised without model generation.
- PDF toolbar-only smoke PASS: .uiprev/pdf-reader678-1793518933935; keyboard, compact menus, dark/light, EN/TR and 125% scaling including short-window bounds.
- Impeccable layout detector on both CSS files returned []. node --check on changed smoke and git diff --check passed.

## Visual evidence

Selected final native captures copied under tmp/surface828/read-dub/: dub-wide-dark.png, dub-wide-light.png, dub-narrow-dark.png, dub-narrow-light.png; reader-wide-dark.png, reader-wide-light.png, reader-narrow-dark.png, reader-narrow-light.png.

Inspected final dubbing wide/narrow dark/light: reference voice now immediately follows source at640; production below. Footer stays visible; voice actions, advanced settings and long delivery text remain available. Wide source card has deliberate spare vertical space beside the longer voice section so production follows both setup tasks without DOM/visual divergence.

Inspected reader wide/narrow dark/light: less dead space before page label/prose, unchanged readable measure, no clipped tool actions; narrow tools retain icon-based disclosure and a bounded menu. Existing narration stays independently scrollable; page text remains visible below it. No new shared motion, fonts, theme definitions, index markup or product claims.

Limits: controlled CPU/fixture UI validation only, no live GPU speech/model/provider/DRM quality claim. Existing web speech/reading prose is not editorially reflowed or rewritten. No start.bat/GPU launch was required for this CSS-only scope. No commits or global docs edited by this agent.
