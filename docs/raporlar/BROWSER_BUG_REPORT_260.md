# BROWSER_BUG_REPORT_260 — R311: SmartTube kanal/playlist derinliği

Tarih: 2026-09-30 · Dal: `devin/1790749080-st-channel-depth` · Kapsam: `src/renderer/renderer.js` SmartTube kanal sayfası (`ST_CH_TABS`, `renderStChannelTab`, `openInvidiousChannelPage`) + `openInvidiousPlaylistPage` + `backend/invidious.py` `channel_tab`/`playlist` + `main.js` `invidious:channelTab`/`invidious:playlist` hatlarının derinlik/sayfalama denetimi.

## Doğrulanan buglar (4)

Hepsi `tests/smarttube-channel-depth.test.js` ile kırmızı-kanıtlı (master'da 4/4 FAIL, düzeltmede 4/4 PASS):

1. **Uçuşta kalan sekme isteği yeni sekmenin gövdesine yazıyordu** — `renderStChannelTab` yalnız `stSectionSeq`'ye bakıyordu; aynı kanalda 'playlists' → 'videos' geçişi sekme sayacını değiştirmediğinden geç dönen ilk istek yeni sekmenin içeriğini eziyordu. Yeni `stChannelTabSeq` sayacı her sekme/arama geçişinde artar; geç sonuç düşer.

2. **Kanal-içi arama kalan sayfa numarasından başlıyordu + Videolar chip'i takılı kalıyordu** — `chSearch` Enter'ı `tabPage`'i sıfırlamıyordu (ör. 3. sayfadayken arama page=4'ten başlıyordu) ve `activeTab` hiç değişmediği için arama sonrası 'Videolar' chip'i `selectTab`'ın early-return'üne takılıyordu — kullanıcı videolara dönemiyordu. Arama artık `tabPage=1`, `activeTab='search'` (nötr) ve tüm chip'ler deselected.

3. **Kanal 'videos' ilk sayfası derinleşemiyordu** — `openInvidiousChannelPage` başlangıç `data.videos`'u "Daha fazla" olmadan çiziyordu; derinleşmek için sekmeyi yeniden seçmek gerekiyordu (üstelik page-1'i yeniden isteyerek). Artık 20+ videoluk ilk sayfa dedupe'lu (`seen`) 2. sayfadan başlayan bir "Daha fazla" satırı alıyor.

4. **Geçici fetch hatası sayfalamayı kalıcı öldürüyordu** — kanal sekme `moreBtn`'ı hatada düğmeyi kaldırıyor VE sayfa sayacını ilerletiyordu (bir sonraki deneme sayfa atlıyordu); playlist `addMoreRow` aynı kalıptaydı. Artık hata yalnız düğmeyi yeniden etkinleştirir — kullanıcı aynı sayfayı tekrar ister; sayaç yalnız başarılı yanıtta ilerler.

## Temiz bulunan yüzey

- `main.js` argüman kapıları: `channelId`/`playlistId` regex + page ≤100 kelepçesi + `--tab` allowlist (query varsa 'videos' fallback) — sağlam.
- `backend/invidious.py` `channel_tab`/`playlist`: ID doğrulama, `_to_int(page,1)`, continuation desteği (community) — sağlam.
- Playlist derinliği: dedupe `seen` + `videoCount` rozeti + yazar→kanal linki — var.
- Arama kanalı: `search` sekmesi backend'de `q` varlığıyla 'videos' uçuna yönlenir; renderer aynı dönüşümü yapar — tutarlı.

## Değişen dosyalar

- `src/renderer/renderer.js` — `stChannelTabSeq` sayacı + `renderStChannelTab` stale-guard'ı + retry-able sayfalama + arama sıfırlaması + ilk-sayfa derinliği.
- `tests/smarttube-channel-depth.test.js` — 4 senaryo (stale render, arama-sayfa/aktif-chip, ilk-sayfa derinliği+dedupe, playlist hata dayanıklılığı).

## Doğrulanmayan sınırlar

- Gerçek Invidious instance'ıyla canlı sayfalama doğrulanmadı (fixture/stub).
- Windows'ta görsel doğrulama yok — mantık değişikliği, platform-bağımsız.

## Testler

- `node tests/smarttube-channel-depth.test.js` — 4/4 PASS (master'da 4/4 FAIL = kırmızı kanıt).
- `node --check src/renderer/renderer.js` — temiz.
