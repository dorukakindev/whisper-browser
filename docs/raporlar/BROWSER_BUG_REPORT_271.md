# R321 — main.js pencere/görünüm/occlusion/split yaşam döngüsü derin okuma

**Tarih:** 2026-09-30
**Dal:** `devin/1790762414-r321-window-lifecycle`
**Kapsam:** R321-A..D tek tur: pencere/görünüm/occlusion/split yaşam döngüsü, geçmiş/yer-imi/favicon depoları, indirme + net.request + webRequest, manga/OCR/yakalama IPC hatları (main.js ~19.6k satır).

## Bulgu (düzeltildi)

### B-321-01 — Sayfasız sekme ikincil görünüme seçilince sağ yarı ölü alan oluyor
- **Kök neden:** `secondaryBrowserTab()` sayfa koşulu kontrol etmiyordu; `browserTabHasPage`'e göre boş (`about:blank`, `restoredUrl`'süz) bir sekme ikincil sayılabiliyordu. `browser:split:set` de aynı koşulu aramıyordu.
- **Etki:** Böyle bir sekme seçildiğinde `applyBrowserViewsLayout` bölünmüş sınırları uygular (aktif sekme birinci yarıya daralır) ama `browserTabShouldBeVisible` sayfasız sekmeyi gizli tutar → sağ yarı kalıcı boş/ölü alan.
- **Ayrıca:** Oturum geri yükleme veya boşaltma sonrası ikincil kimliği sayfasız bir sekmeye denk gelirse aynı ölü yarı görünürdü — düzeltme geri yükleme yolunu da merkezi kapsıyor.
- **Çözüm:** `secondaryBrowserTab()` artık `browserTabHasPage(tab)` koşulu uygular (bölme kararı görünürlük kararıyla aynı şarta bağlandı). `browser:split:set` sayfasız ikincili açık hata ile reddeder ("sayfası olan açık bir sekme seçin").
- **Kanıt:** `tests/browser-view-visibility.test.js`'te 3 yeni senaryo — about:blank ikincil `null` döner, `restoredUrl`'li boşaltılmış sekme ikincil sayılır, aktif sekme ve bozulmuş webContents dışlanır. 7/7 PASS.

## Doğrulanan temiz bölgeler

- **`applyBrowserViewBounds`/`setBrowserViewShown`/`hideBrowserViewOffscreen`:** gizli görünümler `-10000,-10000`'e taşınır (R246 HWND işaretçi-sızıntısı düzeltmesi geçerli); `browserFullscreenBounds` içerik sınırına dayalı.
- **`safeBrowserBounds`:** x/y ≥ 0 kelepçesi, içerik sınırı aşımı null, tamamen dışarıdaysa ret.
- **`splitBrowserBounds`:** `{}` → null (1×1 bölme engeli), ratio [0.25,0.75], aralık [0,24] kelepçesi; matematik tam oturuyor (birinci+aralık+ikinci = tam genişlik).
- **`window-state`:** pozisyon kasıtlı saklanmaz; boyut birincil workArea'ya kelepçelenir (R277 saf modül).
- **`browserModalOccluded`/`browser:setOccluded`/`browser:setBounds`:** yetkili-gönderici + eski-sekme isteği reddi + güvenli sınır.
- **Gezinme yaşam döngüsü:** `navigationRequestSeq` bayat-istek kesicisi her aşamada; `compatibilityMode` tutarlılık kapısı; `instrumentation` askıya alma.
- **`browser:tab:reopen`/`workspace:open`:** kapasite kontrolü + idMap yeniden eşleme + split kimliği aktiften farklı garantisi.
- **history/library/favicons/places depoları:** `writeJsonAtomic` + `.bak` düşümü, mirror-backup önce-yazma, sanitizeRecord hostile kapıları, NTLM/ağ-paylaşımı bekçileri, bounded önbellekler, data:image/* favicon kapısı.
- **net.request çağrıları (SponsorBlock/DeArrow/RYD):** sabit HTTPS host'lar, `redirect:'error'`, `credentials:'omit'`, gövde-bay tavanı, yanıt sonuna kadar canlı zaman aşımı, uçuş-içi tekilleştirme.
- **`browser-downloads`:** WeakSet oturumlar, yerel kaydetme diyaloğu, 8 eşzamanlı/100 kayıt tavanı, `open-player` uzantı beyaz listesi.
- **İzin istek işleyici:** alt-çerçeve köken atıfı, çerçevesiz istekte kapalı-kapı, site-izin deposu, 30 sn zaman aşımıyla reddi.
- **İmge→PNG dönüştürücü:** sandbox + `about:blank|data:` istek beyaz listesi + 80 MP tavanı + PNG sihirli-bayt doğrulaması + finally'de pencere kapanışı.

## Windows etkisi

Düzeltme işaretçi-olay yutması yaşayan aynı görünürlük yolundadır; Windows'ta ölü yarı üstüne denk gelen bir tıklama öncesi riski de kapanır. `install.bat`/`start.bat` etkilenmez.

## Doğrulanmayan sınırlar

Gerçek Windows'ta çoklu monitör kopması ile tam ekran kombinasyonları elle doğrulanmadı (R277 kelepçe mantığı birim-kilitli).

## Test

- `node --test tests/browser-view-visibility.test.js` → 7/7 PASS (yeni 3 senaryo dahil)
- `node --test tests/window-state.test.js` → 8/8 PASS
- `node --check src/main.js` → temiz
