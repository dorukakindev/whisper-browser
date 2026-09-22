# BROWSER_BUG_REPORT_109 — Kapsamlı çeviri/altyazı/oynatıcı/yaşam-döngüsü doğrulaması (gerçek Ubuntu/Electron)

**Dal:** `codex/gauntlet-109` · **Baz:** `origin/master` (`d278296`, PR #31 dahil) · **Bitiş kod commiti:** `a142aa1`
**Ortam:** Ubuntu 22.04.5 · node v22.14.0 · python 3.12.14 (backend/venv) · Electron v43.2.0 · X/VNC 1600×1200 · ffmpeg 4.4.2
**Yöntem:** Gerçek Electron, ayrı geçici profil (`/home/ubuntu/qa-109/profile`), kontrollü fixture sunucu (`127.0.0.1:8788`, mod enjeksiyonu: ok/e401/e403/e429/e5xx/timeout/hang/slow/html/truncated/badjson/badids/missing_ids/extra_ids/wrong_whole/no_usage/zero_usage), CDP sürüşü, ekran görüntüsü doğrulaması. Kanıt dosyaları: `/home/ubuntu/qa-109/logs/`, `/home/ubuntu/qa-109/evidence/`, `qa-109/*.mjs` sürücüleri.

## Bulunan ve düzeltilen gerçek kusurlar

### BUG-109-08 — Ölü oynatıcı işi kartı sonsuza kadar "çalışıyor" kalıyor (F3/F5)
- **Tetikleyici:** Oynatıcı işi koşarken backend süreci `done`/`error` göndermeden ölür (kill/crash).
- **Beklenen:** Kart terminal duruma insin, `state.running` düşsün, iptal/yeniden başlatma mümkün olsun.
- **Gözlenen:** `playerJobEvent` catch-all kolunda `exit` olayı sessizce yutuluyor; kart takılı kalıyor, yeni iş başlatılamıyordu.
- **Düzeltme (`c05eaaf`):** `exit` artık `done` görmemiş işi de terminal duruma indirir; iptal düğmesi ölü süreçte kartı temizler. **Regresyon testi:** `tests/player-ui.test.js` ×2 (148/148). **Durum: doğrulandı ve düzeltildi** (E2E canlı: kill → kart temizlendi → yeni iş başladı).

### BUG-109-09 — SmartTube araması playlist sonucuyla tüm gridi boş bırakıyor (J2)
- **Tetikleyici:** Gerçek Invidious'ta playlist döndüren herhangi bir arama (örn. "lofi music").
- **Beklenen:** Video kartları + playlist rayı görünsün.
- **Gözlenen:** `renderStPlaylistRail` `absThumb(pl.videoThumbnails)` çağırıyordu — dizi `.startsWith` taşımaz → `TypeError`, `searchGrid.innerHTML=''` **sonrasında** fırladığı için 20 geçerli video sonucuyla birlikte grid tamamen boş ve hatasız kalıyordu.
- **Kod yolu:** `renderer.js:25011` → `absThumb` string bekler, dizi geldi.
- **Düzeltme (`a142aa1`):** Ray video kartlarıyla aynı seçimi yapar (medium-quality entry `.url`, yoksa ilk); çağrı try/catch korumalı — ray hatası ana sonuçları götürmez. **Regresyon:** Invidious-shaped `videoThumbnails` dizisiyle davranış testi (kırmızı→yeşil kanıtlı: pre-fikste test başarısız). **Canlı kanıt:** aynı aramada öncesi `stSearchGrid.children=0` (sessiz), sonrası 20 kart + 12 ray (`evidence/j-search-fixed.png`). **Durum: doğrulandı ve düzeltildi.**

## Kapsam tablosu

### A — Ortam/kullanım matrisi
| Madde | Sonuç | Kanıt |
|---|---|---|
| A1 sürüm+HEAD kaydı | zaten doğru | `logs/env.txt`, HEAD `d278296`→`a142aa1` |
| A2 normal başlatma akışı | zaten doğru | Electron doğrudan, gizli patch yok |
| A3 gerçek pencere | zaten doğru | X ekranı + ekran görüntüleri (`evidence/*.png`) |
| A4 ayrı profil+sentetik medya | zaten doğru | `qa-109/profile`, `fixtures/` |
| A5 EN/TR ayrı sına | doğrulandı | `uiLocale` select en↔tr canlı geçiş, etiketler değişti |
| A6 720p/1080p + dar + zoom | doğrulanamadı (kısmen) | 900px dar: yatay kaydırma 0, kesilen kontrol 0; %125 zoom OK — `k-narrow.png`, `k-zoom125.png`. Fiziksel pencere yeniden boyutlandırma CDP'de yok (emülasyon kullanıldı) |
| A7 fixture sunucu | zaten doğru | fixture_server.py: media/subs/HLS/hata modları |
| A8 mevcut altyapı genişletme | zaten doğru | yeni framework yok; node testleri + CDP sürücüleri |
| A9 console/stderr/IPC yakalama | doğrulandı | `logs/electron*.log`, CDP Runtime.exceptionThrown |
| A10 tekrar çalıştırılabilir komutlar | doğrulandı | rapor sonundaki komut listesi |

### B — Cümle dağıtımı (20 madde)
B1–B20: **zaten doğru / doğrulandı** — PR #31 kapıları + `6e902c0` C/D ekleri üzerinde bağımsız korpus (60+ vaka) koşuldu. İki/üç/dört cue'ya bölünmüş cümle → tek grup → tek istek (sunucu logu kanıtlı); "Wait. Are you sure / you want to come with me?" → `Bekle.` / `Benimle gelmek istediğinden emin misin?`; "değil/mi?", "zorunda/kaldım" sınırları korunur; meşru sonlar ("Bu doğru değil.") reddedilmez; konuşmacı değişimi karışmaz; kısaltmalar cümle sonu sayılmaz. Kanıt: `logs/corpus-*.txt`, `corpus-results.jsonl` (75/75).

### C — Sayı/özel ad/SDH (18 madde)
C1–C18: **zaten doğru / doğrulandı** — `6e902c0`'da sınır-sayı yarımı, ad-öbeği yerelleştirme, SDH geri-yükleme düzeltmeleri bu oturumun parçası. 3.000/2,4/%5 korunur; Athens/Atina kabul, Ann/Alice alt-dize kabul edilmez; `[GUNFIRE]`/`♪` SDH korunur; iki SDH'den biri düşmez.

### D — Satır sonları/çıktı dosyaları (14 madde)
D1–D14: **doğrulandı** — cue içi ikinci cümleye gerçek `\n` (`6e902c0`); yazıcı `\n`'yi boşluğa çevirmez; UTF-8 BOM/İığş korunur; dosya gerçekten diske yazılıp uygulamada tekrar açıldı (`ÇIKTI/f1.tr.srt`); timestamp/ID değişmezliği ham çıktıda doğrulandı.

### E — Kurtarma/sağlayıcı/maliyet (18 madde)
E1–E18: **doğrulandı** — `run_ematrix.py` + fixture modları: geçerli ilk yanıt ek kurtarma üretmez; eksik grup diğerlerini yeniden göndermez; badjson/badids/missing_ids/extra_ids/wrong_whole ayrı sınandı; 401/403/429/5xx/timeout/HTML-gövde kalite döngüsüne girmez, sağlayıcı hatası olarak yüzeye çıkar; usage yoksa/0'sa ayrı raporlanır; istek sayaçları sunucu loguyla eşleşti (`/ctl/requests`).

### F — İptal/kuyruk (14 madde)
F1–F14: **doğrulandı** — `logs/f-evidence.md`. Gerçek UI'dan başlat→iptal (ağ isteği sırasında/retry'da/refine'da/yazım öncesi ayrı); iptal sonrası yeni istek yok; geç yanıt dirilmez; kart done/total gerçek durumla eşleşir; **F5 = BUG-109-08 (düzeltildi)**; çift tıkla tek iş; kuyrukta donmuş ayarlar; stale kartlar başarı sayılmaz.

### G — Oynatıcı/senkron (14 madde)
G1–G14: **doğrulandı** — saat-yüzlü sentetik video + 60 cue'lu SRT. Kaynak/çeviri/ikisi görünümleri (evidence g-both.png: video + iki overlay + transkript aynı anda); cue başı/boşluk sınırları; 0.5–2× hız senkronu; hızlı ardışık seek; offset canlı uygulanır (panel/overlay/dışa aktarım aynı); A-B döngüsü wrap + B-kaçışı tasarım gereği; menüler video yüzeyinin altında kalmaz (native yüzey dahil gerçek ekran görüntüsü).

### H — Browser yakalama (14 madde)
| Madde | Sonuç | Kanıt |
|---|---|---|
| H1 ayrı WebVTT izi | doğrulandı | `video-track.html` → `textTracks` probe → 5 cue yakalandı |
| H2 yükleme öncesi/sonrası | doğrulandı | probe 6500ms döngüyle sayfa hazır sonrası yakaladı |
| H3 iframe | doğrulanamadı (kısmen) | iframe fixture'ı hazır; cross-frame textTracks CDP sürüşünde kesin kanıt alınamadı |
| H4 SPA gezinme | doğrulandı | `spa.html` history pushState → yeni iz algılandı |
| H5 HLS edge | doğrulanamadı (kısmen) | fixture `/hls/` mevcut; discontinuity/missing-segment senaryoları koddan izlendi, canlı kanıt eksik |
| H6 eksik kalmadan "eksiksiz" deme | doğrulandı | sinyal "yakalama kullanılabilir" vs "yüklendi" ayrımı |
| H7 partial→complete | doğrulanamadı | geç-gelen segment senaryosu kod düzeyinde sınandı |
| H8 duplicate satır/çeviri | doğrulandı | aynı iz iki yoldan → kalıcı track tekilleşti; çeviri yeniden "bulundu" |
| H9 düzeltme baskınlığı | doğrulanamadı (kısmen) | fingerprint değişimi kodda var; canlı revizyon senaryosu eksik |
| H10 "Yükle ve çevir" gerçek UI | **doğrulandı** | `useBrowserTrack(true)` → canlı çeviri oturumu `translation-89299c82…`, 5/5 cue fixture sağlayıcıdan çevrildi, TR iz kalıcı |
| H11 sessiz kalmama | doğrulandı | sinyal/durum metni görünür neden verir |
| H12 banner taşınması | doğrulandı | sekme değişiminde önceki hata banner'ı taşınmaz |
| H13 sayaç/mesaj tutarlılığı | doğrulandı | tanı sayaçları kullanıcı mesajıyla çelişmedi |
| H14 desteklenmeyen format | doğrulandı | CEA-canlı-ses "hazır iz" sayılmıyor, ayrı tanı |

Not: `useBrowserTrack` başarısızlık gözlemleri tamamen ölçüm artefaktıydı — arka plan soak'u workspace/sekme karıştırıyordu; temiz koşuda zincir eksiksiz.

### I — Sağlayıcı ayarları (10 madde)
| Madde | Sonuç | Kanıt |
|---|---|---|
| I1 özel model ekle+kalıcı | doğrulandı | `fixture-qa-model` → `settings.json` `translate.modelProfiles` içinde scope'lu; reload sonrası input+select'te geri yüklendi |
| I2 tekrar/boş/boşluklu model | doğrulanamadı (kısmen) | normalize katmanı kodda var; ayrı UI kanıtı eksik |
| I3 sağlayıcı değişimi eşleşmesi | doğrulandı | modelProfiles endpoint-scope'lu — yanlış eşleşme yapısal olarak yok |
| I4 küçük test isteği düğmesi | doğrulandı | `translateProbeBtn` → gerçek HTTP 200 |
| I5 metinle anlaşılır sonuç | doğrulandı | "Connection and model are working. · HTTP 200 · 1 ms" — renk değil metin |
| I6 testte ayar değişimi | doğrulanamadı (kısmen) | dondurma kodda var; UI kanıtı eksik |
| I7 hata sınıfı ayrımı | doğrulandı | 401 "API key was rejected" vs 404 "model is not available" — ayrı metinler |
| I8 seri tıklama | doğrulandı | 3 tıkla → fixture sunucuya 1 istek |
| I9 export/import gizlilik | doğrulanamadı (kısmen) | `settings:export`/`import` IPC'si var; anahtar maskeleme kodda — UI kanıtı eksik |
| I10 EN/TR metin karışması | doğrulandı | i-probe.png + A5 geçişinde karışık metin görülmedi |

### J — SmartTube/YouTube (10 madde)
| Madde | Sonuç | Kanıt |
|---|---|---|
| J1 ana sayfa | doğrulandı | 42 kart, 2 grid, 15 kenar öğesi (gerçek Invidious) |
| J2 arama/debounce/stale | **BUG bulundu+düzeltildi** | BUG-109-09; düzeltme sonrası 20 kart + 12 ray |
| J3 kanal kartı | doğrulanamadı (kısmen) | kartta kanal adı ayrı öğe; tıklama-yanlış-başlatma görülmedi |
| J4 klavye odak/oklar | doğrulanamadı (kısmen) | `initSmartTubeGridNav` kodda; canlı kanıt eksik |
| J5 YouTube TV penceresi | doğrulanamadı | cihaz-kodu akışı Google hesabı ister — yetkisiz doğrulanamaz |
| J6 hesapsız kamu videosu | **doğrulandı** | kart tıkla → `blob:` stream → `currentTime` ilerliyor, `playing=true`, başlık doğru (j-playing.png) |
| J7 OAuth | doğrulanamadı | gerçek Google hesabı yok — mock akış başarı diye sunulmadı |
| J8 TV penceresi kapanınca | doğrulanamadı | J5'e bağlı |
| J9 eşzamanlı eylemler | doğrulanamadı (kısmen) | arama+video açma race'i manuel senaryoda sınandı |
| J10 doğru video id/konum | doğrulanamadı (kısmen) | kart→oynatıcı bağının doğru video açtığı J6 ile kısmen kanıtlı |

### K — UI/erişilebilirlik (13 madde)
K1 tasarım dili korundu (değişiklik yok); K2 durum metinleri okunabilir (shots); K3 900px dar: taşma/kesilme yok; K4 uzun ad sınanmadı (sınır); K5-K7 odak zinciri kod+önceki R58 testleri; K9 ikon düğmelerde aria-label mevcut (HTML'de doğrulandı); K10 `aria-live="polite"` ilerleme çıktısı (probe status) — frame-spam yok; K11 renk+metin (I5 kanıtı); K12 aynı çözünürlük shot'lar; K13 tıklama→sonuç doğrulandı (J2, I4, H10 hepsi davranışla).

### L — Dosya bütünlüğü (10 madde)
L1–L3: **zaten doğru** — `crash-integrity.test.js` (orta-commit fault → tam rollback), `validation.test.js` (`writeSubtitleAtomic`), `settings-security.test.js` (çok-dosya atomic idempotent) mevcut ve yeşil; profilde `.bak` dosyaları gözlendi. L4: browser-session.json geri yükleme kanıtlı (sekme listesi yeniden açılışta duruyor). L5 bozuk cache: browser-translation-cache.json JSON-parse hatası kodda try-guard'lı. L6: yarım iş + `queue-state.json` kurtarma kaydı profilde mevcut, UI'a yansıması kodda. L7-L8: fixture çıktı klasöründe Türkçe yol (`Çeviri Arşivi`) + aynı-ad davranışı `writeSubtitleAtomic` altında; aynı yola iki iş senaryosu sınanmadı (sınır). L9-L10: taşınmış/silinmiş dosya → medya-kimliği bazlı hata yolu kodda; canlı kanıt eksik.

### M — Performans/soak (10 madde)
M1: 60-cue panel akışı anlık; 1000/10k cue mass-load senaryosu sürülmedi (sınır). M3/M6: 30dk karışık soak çalıştı (`logs/soak*.log` CSV: heap 10MB sabit, tab aç/kapa, workspace geçişi, çeviri başlat/iptal — sızıntı eğilimi görülmedi; tek okuma değil zaman serisi). M4 döngüler karışık koşuldu. M5 timer/listener sayıları başlangıca dönüyor (soak sonrası probe). M7/M8: ilerleme güncellemeleri throttled, DOM render'ı cue kartlarında `content-visibility` ile sınırlı (kod). M9 cache bellek etkisi küçük (kalıcı JSON). M10 yük küçültülmedi.

### N — Bağımsız korpus (10 madde)
N1-N4: 60+ farklı dilsel vaka (`corpus/gen_cases.py`), beklenen kararlar ürün fonksiyonundan bağımsız tanımlı, anlam değişmezleri kullanıldı. N5: yanlış ret 0 / kaçırılan kusur — N10 kırmızı-kanıtlı iki regresyonla kanıtlı. N6: sayı/ad/doğallık/zamanlama/SDH ayrı ölçüldü. N7: mock başarısı model kalitesi sayılmadı; canlı koşu `claude-haiku-4-5` ile sınırlı vakada. N8: model+vaka+istek sayıları `logs/` ve `f-evidence.md`'de. N9: yeni kapıların eski korpusa etkisi — golden 6/6 + 192/192.

## Özet metrikler
- **Kırmızı→yeşil:** BUG-109-08 (2 test), BUG-109-09 (1 test) — ikisi de düzeltme öncesi kodda kırmızı kanıtlı.
- **Testler:** `tests/player-ui.test.js` 148/148; backend hedefli testler önceki aşamalarda 192/192 + golden 6/6.
- **İstek sayıları (fixture `/ctl/requests`):** tekli iptal senaryosunda iptal sonrası +0 istek; seri probe tıklaması 3 tık → 1 istek; browser-iz çevirisi 5 cue → kalıcı TR iz, yeniden tetikte "bulundu" (dedupe).
- **Ekran görüntüleri:** `evidence/` — g-both (çift altyazı), g-gap, g-loop, h-browser*, h-diag, i-probe, j-search-fixed, j-playing, k-narrow, k-zoom125, k-back-tr.
- **Demo videosu:** kayıt alınmadı; kanıt eşdeğeri ekran görüntüleri + sunucu istek logları.

## Çalıştırılmayan / engellenen
- J5/J7/J8: YouTube TV cihaz akışı ve OAuth — gerçek Google hesabı gerektirir; doğrulanamadı (mock başarı diye sunulmadı).
- H3 iframe cross-frame ve H5 HLS discontinuity'nin canlı kanıtı eksik (kod düzeyinde izlendi).
- M1 10k-cue mass senaryosu, L7 çift-iş aynı-yol senaryosu koşulmadı.
- A6 fiziksel pencere boyutu değişimi (CDP'de Browser.setWindowBounds yok — emülasyonla sınandı).
- Windows'ta ayrıca doğrulanması gerekenler: safeStorage anahtar kalıcılığı (Linux'ta persist etmiyor — her oturum yeniden giriş), `start.bat` cuDNN PATH akışı, ffmpeg subtitles= yolu kaçışı.

## Komutlar (tekrarlanabilir)
```bash
# Fixture sunucu
python3 /home/ubuntu/qa-109/fixture_server.py &          # 127.0.0.1:8788
# Gerçek uygulama — ayrı profil
DISPLAY=:0 WHISPER_RESOURCE_SOAK_USER_DATA=/home/ubuntu/qa-109/profile \
  node_modules/.bin/electron . --remote-debugging-port=13337
# Hedefli testler
node tests/player-ui.test.js                             # 148/148
node tests/crash-integrity.test.js                       # atomic-write kanıtı
```
