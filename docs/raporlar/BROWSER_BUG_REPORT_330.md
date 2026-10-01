# BROWSER_BUG_REPORT_330 — Kuyruk-50 madde 18: Parça bazlı senkron profilleri

Tarih: 2026-10-01 · Dal: `devin/1790883598-local-sync-profiles` · Kod: `a162ab9`

## Gereksinim ↔ uygulama

| Gereksinim | Önceki durum | Yeni durum |
|---|---|---|
| Farklı ses/altyazı parçaları için ayrı senkron ayarı | Web modunda `subtitleSyncRecords` (iz+hash+iki-nokta dönüşüm) zaten vardı; **yerel modda tek global `player.offset`** — dosya/parça değişince eski kayma yeni parçaya sızıyordu | `player.offsetProfiles`: `'<p\|s>\|<ses>\|<yol>'` anahtarlı parça-bazlı harita; watch prefs (`offsetProfiles`/`offset2`) ve `localSubtitleWorkspace` snapshot'ında kalıcı |
| Parça değişiminde doğru profil | Yok — `prefs.offset` tek değer | `loadSubtitle` başarı yolunda `applyLocalSyncProfile`: kayıtlı profil uygulanır; farklı dosyaya geçişte profilsiz parça **0'dan başlar** (sızıntı giderildi); ilk yüklemede legacy `prefs.offset` korunur (geriye uyumluluk) |
| Ses parçası boyutu | Yok | Profil anahtarına `playerAudioLang` (seçili ses izi) dahil — `eng`/`tur` sesi ayrı profil alır |
| Dışa aktarma vs yalnız oynatma ayrımı | `applyOffsetToFile` zaten kalıcı `subs:shift` çağırıyordu; ayrım UI'da belirsizdi | Kaydırıcı/giriş `title="Yalnız oynatma — dosyayı değiştirmez"`; düğme `title="Dosyaya kalıcı işlenir; .bak yedeği"` — EN/TR çift |

## Bulunan ve düzeltilen kusur

**İkinci kanal tek gecikmeyi paylaşıyordu:** `renderCue` `cues2`'yi `t = videoTime - player.offset` ile arıyordu — kaynak dosyanın kayması çeviri/karşılaştırma kanalına da uygulanıyordu (uygulama-üretimi çeviriler video-zamanında kayıtlı olduğundan yanlış kayıyordu). Artık `player.offset2` bağımsız; varsayılan 0 (video zamanı), `sub2Offset` sayısal girişiyle ayarlanır, kendi profili saklanır.

## Kanıt

- `node tests/local-sync-profiles.test.js` → **9/9** (anahtar, web no-op, geri yükleme, parça-değişimi sıfırlaması, legacy koruma, yazım, ses parçası ayrımı, prefs taşıması, kaynak-yolu)
- `node tests/cue-list-perf.test.js` → 8/8, `tests/browser-subtitle-sync.test.js` → geçti, `tests/browser-subtitle-long-timeline.test.js` → geçti
- `node --check` renderer.js/ui-locale.js → temiz

## Windows / doğrulanmamış

- `sub2Offset` UI yalnız statik denetlendi (Electron'da görsel doğrulama yapılmadı; number input dar panelde 5.5em — taşma riski düşük ama görülmeli).
- Oynatma sırasında `video.audioTracks` (yerel çok-ses) profil anahtarına girmez — Electron'da çok-sesli dosya oynatımı `playerAudioLang` üzerinden kurulum zamanı seçimiyle sınırlı; anahtar onu kapsar.
- CI koşamaz (hesap flag'i): doğrulama yerel hedefli testlerle yapıldı.
