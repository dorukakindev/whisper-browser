# Browser ownership, navigation and memory mechanisms

Implemented 2026-11-01 on the existing Castlabs Electron browser. Independent adaptations of public source mechanisms; no upstream browser, extension shim, new paid service or security relaxation was installed. Existing profile, sandbox, context isolation, URL policy, download manager and instrumentation protections remain.

## Delivered behavior

- `browser-view-registry.js` binds each native view to one tab and native owner. Main/mini transfers validate the exact prior owner and roll back a failed attachment. Destruction, crash and unload release ownership; a delayed mini close cannot steal a replacement view.
- Plain HTTP(S) foreground/background link dispositions become application tabs. About-blank bootstrap, POST, auth hosts/routes/parameters, named or feature-bearing windows and nested popups retain Electron's real popup/opener/session path. Unclassified new-window requests stay popups conservatively.
- Session and recently closed records retain at most40 sanitized navigation entries and the active index. Native `navigationHistory.restore()` rebuilds Back/Forward before initial navigation. Only URL/title are stored: no opaque pageState, cookies, POST body or auth callback parameters. Incompatible/unsupported history falls back to the saved page URL.
- Explicit memory reclaim checks at most two background tabs idle for five minutes, then calls the existing full unload validation. Native audibility, runtime video/forms, mini/split, capture work, subtitle jobs, application audio, dub, ASR and active task ledger protect content. Unknown host/runtime state prevents unloading. No automatic timer or blanket background-throttling change was added.
- The browser engine panel reports runtime and actual loaded-extension metadata, with an explicit unknown count when unavailable. It does not claim full Chrome Web Store, private browsing, cloud sync or a working generic extension host.

The new `BrowserMechanismsUI.open()` panel uses the normal application bridge and separate component CSS. Main handlers require the existing authorized application sender. No web page receives a new IPC capability.

## Source mechanisms

- [Min view manager, pinned source](https://github.com/minbrowser/min/blob/c92079cde045c38ab844e53501e9c5178d503a45/main/viewManager.js): ownership/event routing, popup distinction and central teardown. Apache-2.0 source reviewed as a behavioral reference; implementation here is independent and preserves stricter popup classification.
- [Electron NavigationHistory](https://www.electronjs.org/docs/latest/api/navigation-history): native restore/getAllEntries/getActiveIndex contract. Latest documentation was checked; runtime acceptance must use the installed Castlabs version. Opaque entry state is deliberately excluded here.
- [Electron extension support](https://www.electronjs.org/docs/latest/api/extensions): selected native APIs, unpacked persistent-session loading, no arbitrary Chrome-extension compatibility.
- [electron-browser-shell renderer adapter, pinned source](https://github.com/samuelmaddock/electron-browser-shell/blob/3817c4236f8511156086eb4541f364679b277b40/packages/electron-chrome-extensions/src/renderer/index.ts): downloads no-op and storage alias risks explain why a whole compatibility shim was not silently installed.
- [Ferdium popup/session reference](https://github.com/ferdium/ferdium-app/blob/deabf8308f37cde7d9baba5729f90d885fab3341/src/index.ts): opener/session and permission-lifetime comparison. No permissive webSecurity/Node settings were copied.

## Per-recommendation disposition

`Current` means an existing implemented mechanism was preserved, not newly written or freshly certified for every real site. `Done` means the scoped code above is implemented. `Deferred` identifies concrete additional requirements rather than claiming unsupported behavior.

| Core recommendation | Disposition |
|---|---|
| C01 view ownership/lifecycle | Done: exact native owner registry, atomic transfers, release on close/crash/unload; mini replacement identity guard. |
| C02 normal tab vs popup | Done conservatively: foreground/background plain links; real auth/POST/blank/nested popup path retained. |
| C03 selected containers | Deferred: manifest/caption fetch, permissions, cookies, popup and export consumers currently share the default partition; changing a label alone would break account/media identity. |
| C04 private lifecycle | Deferred with C03: no private label until history, closed tabs, previews, assistant context and export all honor it. |
| C05 lazy restore | Current and extended: lazy views preserved; bounded native navigation stack added. |
| C06 safe suspend policy | Done as explicit bounded reclaim; existing full runtime/capture checks retained. Automatic pressure timer intentionally absent. |
| C07 crash recovery | Current bounded crash policy; ownership release added before recreate. No restart-all behavior. |
| C08 damaged-session recovery | Current primary/backup atomic recovery and warning; no duplicate recovery store/UI introduced. |
| C09 permission lifetime | Current origin broker/callback cancellation retained across lifecycle; no permission broadening. |
| C10 audio vs playback | Done: fresh native audibility and existing all-frame runtime media checks; host dub/jobs additionally protect unload. |
| C11 download ownership | Current session manager, listener dedup, terminal cleanup; no replacement downloader. |
| C12 closed tab metadata | Current bounded reopen plus sanitized navigation-stack metadata. New WebContents identity remains separate. |

| Extension recommendation | Disposition |
|---|---|
| E01 session extension host | Deferred: no selected extension host installed; existing native runtime is preserved. |
| E02 tab lifecycle adapter | Ownership seam delivered; Chrome tab-event adapter deferred until a concrete extension acceptance target is selected. |
| E03 truthful tab projection | Current browser snapshots plus owner identities; no invented Chrome discarded/index values. |
| E04 windows factory | Current secure real popup factory; generic Chrome windows.create adapter absent. |
| E05 actions popup host | Deferred: no extension action surface accepted/tested; existing media navigation remains. |
| E06 extension context menus | Deferred: no extension entries are inserted without actual frame/selection/owner routing. |
| E07 MV3 worker wake-up | Deferred native acceptance; no namespace-only success claim. |
| E08 load/update inventory | Done as truthful current-session loaded metadata/unknown status; installation/update rollback manager is not claimed. |
| E09 optional permissions/revoke | Deferred: no default-allow/no-op revoke shim installed. |
| E10 compatibility gate | Done: explicit partial native support, missing host/private/general-store guarantees and measurement boundaries. |
| E11 network hook mux | Current shared webRequest mux retained; no override of working native DNR/scripting/webRequest. |
| E12 native messaging opt-in | Deferred: no arbitrary local native host/registry access enabled. |

| Media recommendation | Disposition |
|---|---|
| M01 CDM component lifecycle | Current Castlabs component initialization/readiness and diagnostics. |
| M02 production VMP distinction | External acceptance remains: CDM/EME is not service playback certification. |
| M03 signing sequence | External release packaging/signing acceptance; no credentials/account or signature mutation performed. |
| M04 fuses/offline DRM | Current runtime pin retained; no fuse change or persistent-license promise. |
| M05 playability evidence | Current diagnostic classification; no additional provider adapter is delivered by this slice. |
| M06 signed URL expiry | Existing/adaptor-specific scope; no generic403→DRM/geo claim. No new signed-URL resolver was added in this delivery. |
| M07 bounded media fallback | Existing source pipeline retained; No new fallback adapter was added in this delivery. |
| M08 async player teardown | Native view/mini lifetime identity tightened; acoustic A→B→A acceptance remains separate. |
| M09 retry budgets | Current bounded navigation/crash budgets; no new media retry adapter was added. |
| M10 correlated resolver | Current request/generation ownership retained; no new resolver was added. |
| M11 selected session context | Deferred with C03; default account/media partition unchanged. |
| M12 one session download hook | Current download manager/session mux retained. |
| M13 OAuth opener/session | Done classification while retaining real native popup identity. |
| M14 UA during redirects | Current initialization timing retained; no mid-POST spoof/reload added. |
| M15 check/request permissions | Current shared origin policy retained; no automatic allowlist added. |

## Focused validation

`node --test --test-isolation=none tests/four-browser-mechanisms.test.js`: **8/8 PASS, exit0**. Covers owner rollback/cleanup, delayed mini replacement, real session disk history roundtrip, restore payload, popup policy, bounded single-flight reclaim and host audio/job fail-closed behavior. Syntax checks run on changed JavaScript.

No full suite, upstream browser execution, store-extension installation, real OAuth account, production DRM/VMP or acoustic playback acceptance was run for this slice. Parent's single isolated native run covers native/UI integration separately. Local research reports and their source-index artifacts are not part of this implementation publication.
