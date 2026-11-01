# R842 RSS seçilmiş kaynak haritası

Bütün bağlantılar inceleme anındaki tam commit kimliğine sabittir. Paket/README bağlamı çalışma zamanı kabulü değildir. Kaynak gövdeleri ignored cache’te; burada yalnız referanslar vardır.

## K1

Karakeep scheduler, fetch, GUID import, partial bookmark sonuçları

- [karakeep-app/karakeep · apps/workers/workers/feedWorker.ts](https://github.com/karakeep-app/karakeep/blob/17a04dc839ea0267a47d305ba431e90545343746/apps/workers/workers/feedWorker.ts)

## K2

Karakeep RSS parser ve guid/id/link normalizasyonu

- [karakeep-app/karakeep · apps/workers/workers/utils/feedParser.ts](https://github.com/karakeep-app/karakeep/blob/17a04dc839ea0267a47d305ba431e90545343746/apps/workers/workers/utils/feedParser.ts)

## K3

Karakeep abonelik sahipliği/CRUD ve ayarlar

- [karakeep-app/karakeep · packages/trpc/models/feeds.service.ts](https://github.com/karakeep-app/karakeep/blob/17a04dc839ea0267a47d305ba431e90545343746/packages/trpc/models/feeds.service.ts)
- [karakeep-app/karakeep · packages/trpc/models/feeds.repo.ts](https://github.com/karakeep-app/karakeep/blob/17a04dc839ea0267a47d305ba431e90545343746/packages/trpc/models/feeds.repo.ts)
- [karakeep-app/karakeep · apps/web/components/settings/FeedSettings.tsx](https://github.com/karakeep-app/karakeep/blob/17a04dc839ea0267a47d305ba431e90545343746/apps/web/components/settings/FeedSettings.tsx)

## K4

Karakeep feed durumu ve liste RSS üretimi

- [karakeep-app/karakeep · packages/shared/types/feeds.ts](https://github.com/karakeep-app/karakeep/blob/17a04dc839ea0267a47d305ba431e90545343746/packages/shared/types/feeds.ts)
- [karakeep-app/karakeep · packages/api/routes/rss.ts](https://github.com/karakeep-app/karakeep/blob/17a04dc839ea0267a47d305ba431e90545343746/packages/api/routes/rss.ts)
- [karakeep-app/karakeep · packages/api/utils/rss.ts](https://github.com/karakeep-app/karakeep/blob/17a04dc839ea0267a47d305ba431e90545343746/packages/api/utils/rss.ts)

## M1

Miniflux URL ve HTML feed discovery

- [miniflux/v2 · internal/reader/subscription/finder.go](https://github.com/miniflux/v2/blob/faecfa2fac61a91f4f69550bb1afd506c4b51749/internal/reader/subscription/finder.go)

## M2

Miniflux çoklu format ve RSS kimliği

- [miniflux/v2 · internal/reader/parser/parser.go](https://github.com/miniflux/v2/blob/faecfa2fac61a91f4f69550bb1afd506c4b51749/internal/reader/parser/parser.go)
- [miniflux/v2 · internal/reader/rss/adapter.go](https://github.com/miniflux/v2/blob/faecfa2fac61a91f4f69550bb1afd506c4b51749/internal/reader/rss/adapter.go)
- [miniflux/v2 · internal/reader/atom/atom_10_adapter.go](https://github.com/miniflux/v2/blob/faecfa2fac61a91f4f69550bb1afd506c4b51749/internal/reader/atom/atom_10_adapter.go)
- [miniflux/v2 · internal/reader/json/adapter.go](https://github.com/miniflux/v2/blob/faecfa2fac61a91f4f69550bb1afd506c4b51749/internal/reader/json/adapter.go)

## M3

Miniflux conditional HTTP ve body/hata ayrımı

- [miniflux/v2 · internal/reader/fetcher/request_builder.go](https://github.com/miniflux/v2/blob/faecfa2fac61a91f4f69550bb1afd506c4b51749/internal/reader/fetcher/request_builder.go)
- [miniflux/v2 · internal/reader/fetcher/response_handler.go](https://github.com/miniflux/v2/blob/faecfa2fac61a91f4f69550bb1afd506c4b51749/internal/reader/fetcher/response_handler.go)

## M4

Miniflux full-content, filter, sanitization

- [miniflux/v2 · internal/reader/processor/processor.go](https://github.com/miniflux/v2/blob/faecfa2fac61a91f4f69550bb1afd506c4b51749/internal/reader/processor/processor.go)

## M5

Miniflux enclosure MIME ve medya ilerlemesi

- [miniflux/v2 · internal/model/enclosure.go](https://github.com/miniflux/v2/blob/faecfa2fac61a91f4f69550bb1afd506c4b51749/internal/model/enclosure.go)
- [miniflux/v2 · internal/storage/enclosure.go](https://github.com/miniflux/v2/blob/faecfa2fac61a91f4f69550bb1afd506c4b51749/internal/storage/enclosure.go)

## F1

Folo unified discovery ve OPML seçim formu

- [RSSNext/Folo · apps/desktop/layer/renderer/src/modules/discover/UnifiedDiscoverForm.tsx](https://github.com/RSSNext/Folo/blob/70a630a62a46de8aed945d7f11812a292df7fab1/apps/desktop/layer/renderer/src/modules/discover/UnifiedDiscoverForm.tsx)
- [RSSNext/Folo · apps/desktop/layer/renderer/src/modules/discover/FeedForm.tsx](https://github.com/RSSNext/Folo/blob/70a630a62a46de8aed945d7f11812a292df7fab1/apps/desktop/layer/renderer/src/modules/discover/FeedForm.tsx)
- [RSSNext/Folo · apps/desktop/layer/renderer/src/modules/discover/OpmlSelectionModal.tsx](https://github.com/RSSNext/Folo/blob/70a630a62a46de8aed945d7f11812a292df7fab1/apps/desktop/layer/renderer/src/modules/discover/OpmlSelectionModal.tsx)

## F2

Folo medya kartı ve okunma kuyruğu

- [RSSNext/Folo · apps/desktop/layer/renderer/src/modules/entry-column/Items/getItemComponentByView.ts](https://github.com/RSSNext/Folo/blob/70a630a62a46de8aed945d7f11812a292df7fab1/apps/desktop/layer/renderer/src/modules/entry-column/Items/getItemComponentByView.ts)
- [RSSNext/Folo · apps/desktop/layer/renderer/src/modules/entry-column/hooks/useEntryMarkReadHandler.tsx](https://github.com/RSSNext/Folo/blob/70a630a62a46de8aed945d7f11812a292df7fab1/apps/desktop/layer/renderer/src/modules/entry-column/hooks/useEntryMarkReadHandler.tsx)

## F3

Folo siteye özel video embed üretimi

- [RSSNext/Folo · packages/internal/utils/src/url-for-video.ts](https://github.com/RSSNext/Folo/blob/70a630a62a46de8aed945d7f11812a292df7fab1/packages/internal/utils/src/url-for-video.ts)

## H1

RSSHub Radar ve cache

- [DIYgod/RSSHub · lib/api/radar/rules/one.ts](https://github.com/DIYgod/RSSHub/blob/986522cde7e5332a8adb634e6600c5788ede93a0/lib/api/radar/rules/one.ts)
- [DIYgod/RSSHub · lib/middleware/cache.ts](https://github.com/DIYgod/RSSHub/blob/986522cde7e5332a8adb634e6600c5788ede93a0/lib/middleware/cache.ts)
- [DIYgod/RSSHub · lib/utils/cache/index.ts](https://github.com/DIYgod/RSSHub/blob/986522cde7e5332a8adb634e6600c5788ede93a0/lib/utils/cache/index.ts)

## H2

RSSHub Letterboxd diary adapter

- [DIYgod/RSSHub · lib/routes/letterboxd/userdiary.ts](https://github.com/DIYgod/RSSHub/blob/986522cde7e5332a8adb634e6600c5788ede93a0/lib/routes/letterboxd/userdiary.ts)
- [DIYgod/RSSHub · lib/routes/letterboxd/utils.ts](https://github.com/DIYgod/RSSHub/blob/986522cde7e5332a8adb634e6600c5788ede93a0/lib/routes/letterboxd/utils.ts)

## H3

RSSHub IMDb chart route

- [DIYgod/RSSHub · lib/routes/imdb/chart.tsx](https://github.com/DIYgod/RSSHub/blob/986522cde7e5332a8adb634e6600c5788ede93a0/lib/routes/imdb/chart.tsx)

## P1

Node rss-parser XML ayrıştırma ve gerçek paket

- [rbren/rss-parser · lib/parser.js](https://github.com/rbren/rss-parser/blob/394178530e87fa010efc6e8d5dd4e801715c5e63/lib/parser.js)
- [rbren/rss-parser · lib/fields.js](https://github.com/rbren/rss-parser/blob/394178530e87fa010efc6e8d5dd4e801715c5e63/lib/fields.js)
- [rbren/rss-parser · package.json](https://github.com/rbren/rss-parser/blob/394178530e87fa010efc6e8d5dd4e801715c5e63/package.json)

## G1

RSS Guard feed parser ve Qt medya olayları

- [martinrotter/rssguard · src/librssguard-standard/src/parsers/feedparser.cpp](https://github.com/martinrotter/rssguard/blob/de5530b5af73ab6f600bd838513e59f7c54ab591/src/librssguard-standard/src/parsers/feedparser.cpp)
- [martinrotter/rssguard · src/librssguard/gui/mediaplayer/qtmultimedia/qtmultimediabackend.cpp](https://github.com/martinrotter/rssguard/blob/de5530b5af73ab6f600bd838513e59f7c54ab591/src/librssguard/gui/mediaplayer/qtmultimedia/qtmultimediabackend.cpp)

## FR1

FreshRSS kimlik, read-state ve feed ayarları

- [FreshRSS/FreshRSS · app/Models/Feed.php](https://github.com/FreshRSS/FreshRSS/blob/fa040c2ebbf01dd1d9ef854c855ace3a342d26f9/app/Models/Feed.php)
- [FreshRSS/FreshRSS · app/Models/EntryDAO.php](https://github.com/FreshRSS/FreshRSS/blob/fa040c2ebbf01dd1d9ef854c855ace3a342d26f9/app/Models/EntryDAO.php)
- [FreshRSS/FreshRSS · app/views/subscription/feed.phtml](https://github.com/FreshRSS/FreshRSS/blob/fa040c2ebbf01dd1d9ef854c855ace3a342d26f9/app/views/subscription/feed.phtml)
