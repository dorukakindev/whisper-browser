# Userscript service and sandbox runtime

Implemented 2026-11-01. The local manager previews and explicitly confirms script bytes and permission changes before installation. This is one limited userscript engine, not Tampermonkey/Violentmonkey/H5Player or Chrome-extension compatibility.

## Delivered

`userscript-service.js` registers the application-only `userscripts:request` management route. It supports list, pasted/file/explicit HTTPS preview, owner-bound/revision-bound install, enable/disable, exact-origin pause, confirmed rollback/removal, manual scoped run, and ephemeral menus/commands. Preview tokens expire after10minutes and are limited to8. The existing model/store preserves stable IDs, five previous revisions, bounded errors and JSON values.

HTTPS preview uses the existing public-address/DNS-pinned feed transport with redirect/time/body controls and no browser cookies, then enforces the smaller512KiB script bound. Native `.user.js` file selection is read-only and bounded; symlink files are rejected. No update URL is followed automatically.

`userscript-preload.js` is registered independently as a session frame preload. It imports only Electron's sandbox API and never evaluates third-party code in the existing privileged preload world999. Privileged scripts execute in separate worlds2000+ with per-script bridges. Explicit sole `@grant none` scripts may execute in page world0; no GM/IPC bridge is exposed there.

The service binds each runtime capability to the native WebContents, exact frame, browser tab, document generation, current URL and script revision. Every operation rechecks enabled state, pause, scope and declared grant. Navigation, crash, unload, disable/update/removal and pagehide revoke capabilities. Stale menus are rejected and pruned. Ordinary web pages cannot select another script's ID or discover a generic IPC method.

Supported local APIs are the declared legacy `GM_*` forms and Promise `GM.*` forms for info, addStyle, get/set/delete/list values, value-change listeners and managed menu commands. Values are seeded per script and receive change events; `__proto__` remains an own data key during native-world seed serialization. Menu callbacks and styles are managed resources. Arbitrary DOM effects, timers and event handlers installed directly by a script cannot be undone safely: disable/update/pause require reload for complete removal of those effects.

Document-start executes at preload time; document-end waits for DOMContentLoaded and idle adds a subsequent task. Same-document URL changes refresh current scope and notify the runtime without rerunning arbitrary script code.

## Explicit limits

- **Main browser frames only.** On the installed runtime, registered frame preloads did not execute inside iframes while `nodeIntegrationInSubFrames` remained disabled. That option was not enabled. Child-frame bootstrap is explicitly denied and `support.iframeExecution=false` is returned. `@noframes` is parsed and never bypassed, but the engine does not claim general iframe coverage.
- GM XMLHttpRequest/network grants are parsed but actually blocked by service preview, enabling and bootstrap. Such scripts can be stored disabled; there is no silently successful XHR stub. Ordinary browser fetch/DOM requests still follow normal browser/CORS behavior.
- `@require`, `@resource`, unsafeWindow, unsupported mandatory grants and privileged page-world injection block enabled execution.
- No automatic update/download manager, extension API shim, second CDP engine, security bypass, account or paid API was introduced.
- Runtime contexts and managed operations are bounded. This does not promise to preempt arbitrary third-party JavaScript loops or fully undo its DOM behavior.

## API and source grounding

The model/store independently adapt component matching and metadata concepts from [Min's pinned userscript manager](https://github.com/minbrowser/min/blob/c92079cde045c38ab844e53501e9c5178d503a45/js/userscripts.js) and [Violentmonkey's pinned metadata model](https://github.com/violentmonkey/violentmonkey/blob/308174fcb5b160b2fdb2919db1fc2a18ac324799/src/common/userscript-meta.js). No upstream framework body was copied into this runtime.

The bridge/runtime uses Electron's [contextBridge isolated worlds](https://www.electronjs.org/docs/latest/api/context-bridge) and [session preload registration](https://www.electronjs.org/docs/latest/api/session#sesregisterpreloadscriptscript). [Web preferences](https://www.electronjs.org/docs/latest/api/structures/web-preferences) describe the separate Node-in-subframes option; the existing sandbox and Node settings remain unchanged.

## Focused verification

`node --test --test-isolation=none tests/four-userscript-runtime.test.js`: **4/4 PASS**. Real temporary store writes verify preview owner/revision checks, explicit remote fetch, blocked XHR, scope/sender/frame/generation/grant enforcement, per-script values, managed menus, pause and revocation.

`tests/electron-four-userscript-runtime.smoke.cjs`: isolated Windows Electron loopback fixture **exit0**. It includes the real existing browser preload and the new independent preload. Observed:

- document-start marker73 was visible to the very first inline page script;
- `require`, `process` and the trusted browser bridge were undefined in the userscript world, while the real trusted bridge existed in world999;
- page world had no GM getter; independent scripts retained independent values, including own `__proto__` data;
- managed menu callback and actual GM value-change listener fired;
- SPA navigation did not rerun the script;
- disabling removed managed style/menu resources while deliberately leaving arbitrary DOM data until reload;
- iframe scripts remained absent and support explicitly reported the limitation.

Synthetic evidence: `.uiprev/four-userscript-runtime/result.json`. No real third-party script, user account/profile, provider key or live remote script was used. No full suite, Actions, commit or push was run for this slice.
## Manager surface

The application manager is `UserscriptManagerUI.open()` in `renderer/userscript-manager-ui.js`, styled with existing graphite/amber theme tokens. Source import and editing always lead to a preview showing site scope, permission changes, warnings and blocking requirements. Enabling installation requires explicit review; unsupported scripts can be saved disabled. Saved revisions use the same permission preview before restoration. Page controls offer exact-origin pause, a confirmed manual run and current document menu commands. Managed cleanup cannot undo arbitrary script DOM changes, so the manager requests a user reload without triggering one automatically. The manager itself displays script source as text and never evaluates it.
