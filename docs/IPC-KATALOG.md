# IPC katalog — güncel statik kanal envanteri

2026-10-27 kaynak src/*.js kayıtlarından üretildi. Yetkilendirme ve preload yön sözleşmeleri tests/ipc-parity.test.js ile doğrulanır. Kanal sayıları benzersiz statik handle/on adlarıdır.

## ipcMain.handle: 278 kanal

| Önek | Adet | Kanallar |
|---|---|---|
| app | 2 | `app:getEnvInfo`, `app:getPaths` |
| assistant | 9 | `assistant:agentApply`, `assistant:agentCancel`, `assistant:agentResult`, `assistant:agentRun`, `assistant:cancelJob`, `assistant:cancelWebResearch`, `assistant:collections`, `assistant:jobs`, `assistant:webResearch` |
| assistant-threads | 1 | `assistant-threads:request` |
| browser | 108 | `browser:adapters:openFolder`, `browser:adblock:getState`, `browser:adblock:setEnabled`, `browser:archivePage`, `browser:capture:setEnabled`, `browser:capturePage`, `browser:clip:export`, `browser:command`, `browser:compatibility:setEnabled`, `browser:cookies:clearAll`, `browser:cookies:clearSite`, `browser:diagnostics:export`, `browser:diagnostics:preview`, `browser:downloads`, `browser:elementRules`, `browser:exportPagePdf`, `browser:extras`, `browser:favicons:list`, `browser:getState`, `browser:gpuDiagnostics`, `browser:hide`, `browser:jobs:list`, `browser:liveAsr:chunk`, `browser:liveAsr:start`, `browser:liveAsr:stop`, `browser:manga:clear`, `browser:manga:export`, `browser:manga:retryFailed`, `browser:manga:retrySelected`, `browser:manga:start`, `browser:manga:toggle`, `browser:mini:command`, `browser:navigate`, `browser:network:setOnline`, `browser:page:autoContinue`, `browser:page:clear`, `browser:page:context`, `browser:page:exclusions`, `browser:page:export`, `browser:page:history`, `browser:page:pause`, `browser:page:preview`, `browser:page:retryFailed`, `browser:page:retrySection`, `browser:page:reveal`, `browser:page:start`, `browser:page:toggle`, `browser:page:view`, `browser:pageIndex:clear`, `browser:pageIndex:setEnabled`, `browser:permissions:get`, `browser:permissions:respond`, `browser:permissions:update`, `browser:places:clearHistory`, `browser:places:folder`, `browser:places:list`, `browser:places:remove`, `browser:places:toggleBookmark`, `browser:playerAdPrune:getState`, `browser:playerAdPrune:setEnabled`, `browser:profile:update`, `browser:reader`, `browser:readingList:add`, `browser:readingList:list`, `browser:readingList:open`, `browser:readingList:refresh`, `browser:readingList:remove`, `browser:research:export`, `browser:research:exportAnki`, `browser:research:list`, `browser:research:review`, `browser:research:upsert`, `browser:resources:snapshot`, `browser:session:dismissRecovery`, `browser:session:export`, `browser:session:import`, `browser:session:reset`, `browser:session:setRestore`, `browser:session:updateTab`, `browser:setBounds`, `browser:setOccluded`, `browser:setOverlay`, `browser:show`, `browser:snapshotActive`, `browser:split:set`, `browser:sponsorBlock:get`, `browser:subtitle-preference`, `browser:subtitle:captureFull`, `browser:subtitle:export`, `browser:tab:activate`, `browser:tab:close`, `browser:tab:create`, `browser:tab:mute`, `browser:tab:reopen`, `browser:tab:reorder`, `browser:tab:setGroup`, `browser:tab:setPinned`, `browser:tab:unload`, `browser:translation:completeAll`, `browser:translation:displayed`, `browser:translation:retryFailed`, `browser:translation:snapshot`, `browser:translation:start`, `browser:translation:stop`, `browser:videoExtras:get`, `browser:workspace:open`, `browser:workspace:remove`, `browser:workspace:save` |
| burnin | 5 | `burnin:cancel`, `burnin:recovery:discard`, `burnin:recovery:get`, `burnin:recovery:recover`, `burnin:start` |
| cache | 2 | `cache:clear`, `cache:stats` |
| clipboard | 1 | `clipboard:write` |
| dialog | 5 | `dialog:openFile`, `dialog:openFolder`, `dialog:openFolders`, `dialog:openInputFolder`, `dialog:openVideo` |
| dub | 21 | `dub:cancel`, `dub:choosePlaybackAudio`, `dub:config`, `dub:latest`, `dub:plan`, `dub:projectOpen`, `dub:projectSave`, `dub:pronunciations`, `dub:rate`, `dub:referencePrepare`, `dub:referenceRename`, `dub:referenceSource`, `dub:referenceUse`, `dub:references`, `dub:restorePlaybackAudio`, `dub:shorten`, `dub:start`, `dub:textUI`, `dub:workspaceAsset`, `dub:workspaceCancel`, `dub:workspaceExport` |
| history | 4 | `history:authorizeFiles`, `history:clear`, `history:list`, `history:remove` |
| integrity | 2 | `integrity:repair`, `integrity:scan` |
| invidious | 14 | `invidious:cancel`, `invidious:channel`, `invidious:channelTab`, `invidious:comments`, `invidious:downloadStream`, `invidious:feed`, `invidious:login`, `invidious:logout`, `invidious:playlist`, `invidious:probe`, `invidious:search`, `invidious:session`, `invidious:subs`, `invidious:suggest` |
| library | 19 | `library:annotations:list`, `library:annotations:restoreAnchor`, `library:annotations:toggle`, `library:authorizeItem`, `library:collections:list`, `library:collections:membership`, `library:collections:remove`, `library:collections:rename`, `library:collections:reorder`, `library:dupes`, `library:dupes-merge`, `library:list`, `library:relink`, `library:relink-bulk`, `library:relink-suggest`, `library:remove`, `library:search`, `library:searchUnified`, `library:upsert` |
| logs | 1 | `logs:openFolder` |
| maintenance | 2 | `maintenance:updatePrecheck`, `maintenance:updateYtdlp` |
| media | 19 | `media:analyze`, `media:analyzeCancel`, `media:cancelCompatible`, `media:cancelDownload`, `media:download`, `media:downloadSubs`, `media:extractSubtitleTrack`, `media:findSiblingSubs`, `media:listFolder`, `media:prepareCompatible`, `media:probe`, `media:probeTracks`, `media:readSubtitle`, `media:saveImage`, `media:saveSubtitleCopy`, `media:scanFolderBundle`, `media:seekPreview`, `media:waveform`, `media:writeSubtitle` |
| media-catalog | 1 | `media-catalog:request` |
| media-discovery | 1 | `media-discovery:request` |
| media-hub | 1 | `media-hub:request` |
| media-shelf | 1 | `media-shelf:request` |
| media-tools | 1 | `media-tools:request` |
| media-torrents | 1 | `media-torrents:request` |
| media-workflows | 1 | `media-workflows:request` |
| models | 5 | `models:benchmark`, `models:benchmark:cancel`, `models:benchmark:history`, `models:delete`, `models:status` |
| music-analysis | 1 | `music-analysis:request` |
| native-player | 1 | `native-player:request` |
| network | 1 | `network:budget` |
| notify | 1 | `notify` |
| ocr | 2 | `ocr:frame`, `ocr:status` |
| paths | 1 | `paths:scanMedia` |
| pdf | 7 | `pdf:cancel`, `pdf:editBlock`, `pdf:export`, `pdf:open`, `pdf:prepareText`, `pdf:state`, `pdf:translatePages` |
| player | 1 | `player:external` |
| queue | 2 | `queue:load`, `queue:save` |
| settings | 4 | `settings:export`, `settings:import`, `settings:load`, `settings:save` |
| shell | 3 | `shell:openExternal`, `shell:openPath`, `shell:showInFolder` |
| subs | 2 | `subs:rssFeed`, `subs:shift` |
| subscriptions | 2 | `subscriptions:export`, `subscriptions:import` |
| subtitle | 1 | `subtitle:watch` |
| timeline | 1 | `timeline:recovery` |
| transcribe | 2 | `transcribe:cancel`, `transcribe:start` |
| translation | 1 | `translation:probe` |
| watch | 3 | `watch:report`, `watch:start`, `watch:stop` |
| youtube | 10 | `youtube:accountRemove`, `youtube:accountSwitch`, `youtube:authCode`, `youtube:browse`, `youtube:cancel`, `youtube:deviceCode`, `youtube:logout`, `youtube:poll`, `youtube:session`, `youtube:setClient` |
| youtube-tv | 5 | `youtube-tv:close`, `youtube-tv:fullscreen`, `youtube-tv:open`, `youtube-tv:signout`, `youtube-tv:state` |

## ipcMain.on: 17 kanal

| Önek | Adet | Kanallar |
|---|---|---|
| app | 2 | `app:theme-changed`, `app:ui-locale` |
| assistant | 3 | `assistant:action`, `assistant:show`, `assistant:update` |
| browser | 7 | `browser:discovery-signal`, `browser:open-link`, `browser:page-mutated`, `browser:resource-snapshot-response`, `browser:trusted-bridge`, `browser:youtube-guard:policy`, `browser:zoom-wheel` |
| library | 3 | `library:flush-before-close-complete`, `library:search-cancel`, `library:upsert-before-close` |
| queue | 1 | `queue:saveSync` |
| settings | 1 | `settings:saveSync` |
