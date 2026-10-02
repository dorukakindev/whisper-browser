# IPC katalog — `ipcMain.handle` / `ipcMain.on` kanal listesi

Bu belge `src/` altındaki kanal kayıtlarının anlık dökümüdür (R330-1
senkron turunda üretildi, R332'de servis modülleri eklendi, 2026-10-02'de
yeniden üretildi). `ipcMain` kayıtları yalnız `main.js`'te değildir:
`browser-feature-services.js`, `browser-mini-player.js`,
`media-catalog-service.js` de kanal açar. Kanal eklenirken/çıkarılırken
bu dosyayı yeniden üret: kaynak `grep -oE` ile çıkarılır, statik doğruluk
`tests/ipc-parity.test.js` + `ipc-payload-fuzz.test.js` ile kilitlidir.

- `ipcMain.handle`: **223** kanal
- `ipcMain.on`: **12** kanal

## `ipcMain.handle` kanalları

| Önek | Adet | Kanallar |
|---|---|---|
| `browser` | 108 | `browser:adapters:openFolder`, `browser:adblock:getState`, `browser:adblock:setEnabled`, `browser:archivePage`, `browser:capture:setEnabled`, `browser:capturePage`, `browser:clip:export`, `browser:command`, `browser:compatibility:setEnabled`, `browser:cookies:clearAll`, `browser:cookies:clearSite`, `browser:diagnostics:export`, `browser:diagnostics:preview`, `browser:downloads`, `browser:elementRules`, `browser:exportPagePdf`, `browser:extras`, `browser:favicons:list`, `browser:getState`, `browser:gpuDiagnostics`, `browser:hide`, `browser:jobs:list`, `browser:liveAsr:chunk`, `browser:liveAsr:start`, `browser:liveAsr:stop`, `browser:manga:clear`, `browser:manga:export`, `browser:manga:retryFailed`, `browser:manga:retrySelected`, `browser:manga:start`, `browser:manga:toggle`, `browser:mini:command`, `browser:navigate`, `browser:network:setOnline`, `browser:page:autoContinue`, `browser:page:clear`, `browser:page:context`, `browser:page:exclusions`, `browser:page:export`, `browser:page:history`, `browser:page:pause`, `browser:page:preview`, `browser:page:retryFailed`, `browser:page:retrySection`, `browser:page:reveal`, `browser:page:start`, `browser:page:toggle`, `browser:page:view`, `browser:pageIndex:clear`, `browser:pageIndex:setEnabled`, `browser:permissions:get`, `browser:permissions:respond`, `browser:permissions:update`, `browser:places:clearHistory`, `browser:places:folder`, `browser:places:list`, `browser:places:remove`, `browser:places:toggleBookmark`, `browser:playerAdPrune:getState`, `browser:playerAdPrune:setEnabled`, `browser:profile:update`, `browser:reader`, `browser:readingList:add`, `browser:readingList:list`, `browser:readingList:open`, `browser:readingList:refresh`, `browser:readingList:remove`, `browser:research:export`, `browser:research:exportAnki`, `browser:research:list`, `browser:research:review`, `browser:research:upsert`, `browser:resources:snapshot`, `browser:session:dismissRecovery`, `browser:session:export`, `browser:session:import`, `browser:session:reset`, `browser:session:setRestore`, `browser:session:updateTab`, `browser:setBounds`, `browser:setOccluded`, `browser:setOverlay`, `browser:show`, `browser:snapshotActive`, `browser:split:set`, `browser:sponsorBlock:get`, `browser:subtitle-preference`, `browser:subtitle:captureFull`, `browser:subtitle:export`, `browser:tab:activate`, `browser:tab:close`, `browser:tab:create`, `browser:tab:mute`, `browser:tab:reopen`, `browser:tab:reorder`, `browser:tab:setGroup`, `browser:tab:setPinned`, `browser:tab:unload`, `browser:translation:completeAll`, `browser:translation:displayed`, `browser:translation:retryFailed`, `browser:translation:snapshot`, `browser:translation:start`, `browser:translation:stop`, `browser:videoExtras:get`, `browser:workspace:open`, `browser:workspace:remove`, `browser:workspace:save` |
| `library` | 16 | `library:annotations:list`, `library:annotations:restoreAnchor`, `library:annotations:toggle`, `library:authorizeItem`, `library:collections:list`, `library:collections:membership`, `library:collections:remove`, `library:collections:rename`, `library:collections:reorder`, `library:list`, `library:relink`, `library:relink-suggest`, `library:remove`, `library:search`, `library:searchUnified`, `library:upsert` |
| `invidious` | 14 | `invidious:cancel`, `invidious:channel`, `invidious:channelTab`, `invidious:comments`, `invidious:downloadStream`, `invidious:feed`, `invidious:login`, `invidious:logout`, `invidious:playlist`, `invidious:probe`, `invidious:search`, `invidious:session`, `invidious:subs`, `invidious:suggest` |
| `media` | 14 | `media:cancelDownload`, `media:download`, `media:downloadSubs`, `media:extractSubtitleTrack`, `media:findSiblingSubs`, `media:listFolder`, `media:probe`, `media:probeTracks`, `media:readSubtitle`, `media:saveImage`, `media:saveSubtitleCopy`, `media:seekPreview`, `media:waveform`, `media:writeSubtitle` |
| `youtube` | 10 | `youtube:accountRemove`, `youtube:accountSwitch`, `youtube:authCode`, `youtube:browse`, `youtube:cancel`, `youtube:deviceCode`, `youtube:logout`, `youtube:poll`, `youtube:session`, `youtube:setClient` |
| `burnin` | 5 | `burnin:cancel`, `burnin:recovery:discard`, `burnin:recovery:get`, `burnin:recovery:recover`, `burnin:start` |
| `dialog` | 5 | `dialog:openFile`, `dialog:openFolder`, `dialog:openFolders`, `dialog:openInputFolder`, `dialog:openVideo` |
| `models` | 5 | `models:benchmark`, `models:benchmark:cancel`, `models:benchmark:history`, `models:delete`, `models:status` |
| `pdf` | 5 | `pdf:cancel`, `pdf:export`, `pdf:open`, `pdf:state`, `pdf:translatePages` |
| `youtube-tv` | 5 | `youtube-tv:close`, `youtube-tv:fullscreen`, `youtube-tv:open`, `youtube-tv:signout`, `youtube-tv:state` |
| `history` | 4 | `history:authorizeFiles`, `history:clear`, `history:list`, `history:remove` |
| `settings` | 4 | `settings:export`, `settings:import`, `settings:load`, `settings:save` |
| `shell` | 3 | `shell:openExternal`, `shell:openPath`, `shell:showInFolder` |
| `watch` | 3 | `watch:report`, `watch:start`, `watch:stop` |
| `app` | 2 | `app:getEnvInfo`, `app:getPaths` |
| `integrity` | 2 | `integrity:repair`, `integrity:scan` |
| `ocr` | 2 | `ocr:frame`, `ocr:status` |
| `queue` | 2 | `queue:load`, `queue:save` |
| `subs` | 2 | `subs:rssFeed`, `subs:shift` |
| `subscriptions` | 2 | `subscriptions:export`, `subscriptions:import` |
| `transcribe` | 2 | `transcribe:cancel`, `transcribe:start` |
| `clipboard` | 1 | `clipboard:write` |
| `logs` | 1 | `logs:openFolder` |
| `maintenance` | 1 | `maintenance:updateYtdlp` |
| `media-catalog` | 1 | `media-catalog:request` |
| `notify` | 1 | `notify` |
| `paths` | 1 | `paths:scanMedia` |
| `player` | 1 | `player:external` |
| `translation` | 1 | `translation:probe` |

## `ipcMain.on` kanalları

| Kanal |
|---|
| `app:theme-changed` |
| `app:ui-locale` |
| `browser:discovery-signal` |
| `browser:open-link` |
| `browser:page-mutated` |
| `browser:resource-snapshot-response` |
| `browser:trusted-bridge` |
| `library:flush-before-close-complete` |
| `library:search-cancel` |
| `library:upsert-before-close` |
| `queue:saveSync` |
| `settings:saveSync` |
