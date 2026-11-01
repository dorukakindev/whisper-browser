# Userscript research disposition

| Proposal family | Final decision |
|---|---|
| Metadata, component-based matches, exclusion precedence | Implemented: literal scheme/host/path checks, unsafe regex includes blocked. |
| Identity, version, scoped values and five revision snapshots | Implemented in a bounded atomic local store; updates require the expected revision. |
| File/HTTPS code acquisition | Explicit preview, exact code review and confirmation. No automatic remote updates. |
| Run-at and page versus isolated world | Native session preload, document-start/end/idle; separate privileged script worlds, no new page-to-app general bridge. |
| GM values/styles/listeners/menu commands | Implemented narrow sender/frame/tab/revision/grant capabilities; managed callbacks removed on disable/navigation. Arbitrary DOM edits may need explicit reload. |
| GM network, @require, @resource, unsafeWindow | **Blocked at runtime and activation**, not a successful stub. Broad authenticated transport and dependency execution are not delivered. |
| Subframes | Explicit main-frame-only runtime. No Node-in-subframes flag or second debugger host was enabled. |
| H5Player/Tampermonkey/Violentmonkey general compatibility | Not claimed. A third-party script requiring blocked APIs cannot be enabled. |
| Manager and rollback | EN/TR list/detail, permissions and expansion preview, explicit disabled save, source-edit invalidation, site pause, named commands, saved version restore through the same review. |
| Native validation | Actual document-start before inline, isolated world, values/listeners/menu/cleanup; actual main app installed script and native tab navigation. |

No new dependency or extension host. Min and Violentmonkey matching/metadata approaches were inspected as references; no upstream framework bodies were ported.

## Source and license grounding

Read full local userscript report and its source-index, then exact cached selected source functions/licenses. Independent implementation; no GPL code/body or upstream framework copied.

- Min `c92079cde045c38ab844e53501e9c5178d503a45`, **Apache-2.0**, `js/userscripts.js:parseTampermonkeyFeatures` and manager lifecycle were inspected. Min's substring wildcard host matcher was deliberately not ported.
  https://github.com/minbrowser/min/blob/c92079cde045c38ab844e53501e9c5178d503a45/js/userscripts.js
  https://github.com/minbrowser/min/blob/c92079cde045c38ab844e53501e9c5178d503a45/LICENSE.txt
- Violentmonkey `308174fcb5b160b2fdb2919db1fc2a18ac324799`, **MIT**, copyright2017 Gerald, metadata array/scalar schema and component matcher approach inspected. Full MIT text read; no extension macros/transport copied.
  https://github.com/violentmonkey/violentmonkey/blob/308174fcb5b160b2fdb2919db1fc2a18ac324799/src/common/userscript-meta.js
  https://github.com/violentmonkey/violentmonkey/blob/308174fcb5b160b2fdb2919db1fc2a18ac324799/src/background/utils/tester.js
  https://github.com/violentmonkey/violentmonkey/blob/308174fcb5b160b2fdb2919db1fc2a18ac324799/LICENSE
