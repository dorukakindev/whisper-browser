# R126 — GitHub'daki bug dosyalarının doğrulaması + repo önerilerinin seçici uygulaması

Tarih: 2026-09-25 · Dal: `codex/r126-bug-verify-1790363187` · Kapsam: `haze/bug-report-2026-09-24`
dalındaki kapsamlı bulgu listesi (N1–N6, K1–K6) + `BROWSER_BUG_REPORT_124.md` (R124-01..03)
+ `GITHUB_REPO_ONERILERI_2026-09-25.md` içindeki ~45 depo önerisi.

Yöntem: her bulgu güncel master'da satır satır yeniden doğrulandı; gerçek olanlar düzeltildi ve
regresyon testi eklendi; gerçek olmayanlar kanıtıyla birlikte işaretlendi. Önerilerden düşük
eforlu / yüksek faydalı üç madde uygulandı; gerisi gerekçesiyle ertelendi.

## 1. Doğrulama sonuçları — GERÇEK → düzeltildi

| # | Bulgu | Düzeltme | Regresyon testi |
|---|---|---|---|
| N1 | `youtube:poll` `_ytDevice` null yarışı — iptal/çıkış sonrası "hayalet hesap" geri geliyor + TypeError | `src/main.js` — `tvMode` await öncesi sabitlendi; await sonrası `_ytDevice === null` ise upsert+persist atlanıyor, `{ok:false}` döner | `tests/youtube-auth-flow.test.js` testN1 |
| N2 | `_fetch_me` başarısızsa `accountIdFor` `Date.now()` tohumuna düşer → her girişte kopya hesap satırı; e-posta hiç dolmuyor; kimlik kanal başlığına bağlı | `backend/youtube.py` `_fetch_me` artık kanal **ID** döndürüyor (`items[0].id`) ve `user_id` emit'e ekleniyor; `src/youtube-accounts.js` `accountIdFor` → `acct-<userId|email|name|unknown>` kararlı tohum (tam kimliksiz girişler tek `acct-unknown` satırında birleşir) | `tests/youtube-accounts.test.js` (+2) |
| N3 | `youtube:accountRemove` revoke'u çalışan poll slotuna takılıyor → Google grant'ı canlı kalıyor | `src/main.js` — remove öncesi `terminateProcessTree(mediaJobs.youtubeAuth)` + `_ytAbortAuthFlow` + `_ytDevice=null` + `close` olayına 3 sn bekleme; `remoteOk` payload'da | `tests/youtube-auth-flow.test.js` testN3, testN3_noSlot |
| N4 | `upsertAccount` ölü `activeId` parametresi + `expiresIn` sessiz 3600 varsayımı | `src/youtube-accounts.js` — parametre kaldırıldı (tüm çağrılar güncellendi); `expiresIn`: `Number.isFinite && >=0` ise kullanılır (0 = hemen doluyor korunur), değilse 3600 | `tests/youtube-accounts.test.js` (+2) |
| N6 | `youtube:browse` 150 ms busy-wait | `src/main.js` — olay güdümlü bekleme: `held.once('close')` vs 10 sn tavan yarışı | `tests/youtube-auth-flow.test.js` testN6 |
| K1 | `MAX_MEDIA_TIME_SECONDS = 60*60*1000` — sn alanında ms formülü (~1000 saat) | Her iki dosyada `24 * 60 * 60` + "24 saatlik" yorumu | `tests/browser-report126-regressions.test.js` testK1 (200000 sn → 86400 clamp) |
| K2 | `validateBrowserSubtitleDocument` iki liste de boşken `ok:true` | Erken ret: `!expected.length → {ok:false}` | aynı dosya testK2 |
| K3 | `splitBrowserBounds({})` → 1×1 anlamsız yerleşim | `rawBounds.width/height == null → null` | aynı dosya testK3 |
| K4 | `secret-store.setPath` ara düğüm diziyse ezer → veri kaybı | `Array.isArray(current[part]) → return object` (üzerine yazma yok) | aynı dosya testK4 |
| R124-01 | `backend/invidious.py::_vtt_to_srt` boş-satırsız ardışık cue'da önceki cue sessizce düşüyor | `-->` dalında `len(cur) > 1 → cues.append(cur)` flush; ölü koşul `elif → else` | `backend/test_invidious_vtt.py` 5/5 |

R124-02 K1 ile aynı kök (ikisi de `MAX_MEDIA_TIME_SECONDS` birim hatası) — tek düzeltmede kapandı.

## 2. Doğrulama sonuçları — GERÇEK DEĞİL / kapsam dışı / ertelendi

| # | Karar | Kanıt/gerekçe |
|---|---|---|
| K5 | **Yanlış-pozitif (kasıtlı tasarım)** | `SubtitleFileAccess` grant'larının bellek-içi kalması güvenlik tercihidir: kalıcı grant, uygulama yeniden başlatıldığında kullanıcı bilgisi olmadan dosya erişimi demektir. "Bug" değil — davranış `docs/bug-reports/2026-09-24-kapsamli-*.md` §2'de de "kararlanıp dokümante edilmeli" olarak not edilmişti; bu satır dokümantasyon görevini yerine getirir. |
| K6 | **Ertelendi (sınır semantiği kararı)** | `assembleCueSentences` strict `>` ile backend `parse_timecode` sınır davranışı arasındaki asimetri davranış değişikliği gerektirir (hangi taraf gevşeyecek ürün kararıdır). Haze raporu da "hizalama kararı bekliyor" diyor — bu turda değiştirilmedi, backlog'a alındı. |
| N5 | **Bu depoda uygulanamaz** | `tests/r92-deep/` dosyaları haze'nin yerel checkout'unda izlenmeyen (untracked) dosyalar; GitHub'da mevcut değiller → ana süite alınacak bir şey yok. Doğrulandı: `git ls-tree` ve dosya sistemi taramasında `tests/r92-deep/` yok. |
| R124-03 | **Ertelendi (P3 kozmetik)** | renderer `parseClipInput` vs backend `parse_timecode` sözleşme asimetrisi — UI'dan erişilemez, kullanıcı etkisi yok. Tek-kaynak gramer önerisi backlog'da. |

## 3. Repo önerileri — uygulananlar (`GITHUB_REPO_ONERILERI_2026-09-25.md`)

Üç "düşük efor / yüksek fayda" maddesi bu dalda uygulandı:

**A. `Network.enable maxPostDataSize` + POST gövdesi yakalama** (öneri §"Eklenen boşluk")
- `src/main.js`: iki `Network.enable` çağrısına `maxPostDataSize: 1 MB` (kök attach + `Target.attachedToTarget` dalı).
- `requestWillBeSent` artık `method` + `postData`'yı `browserRequestRanges`'ta saklıyor (256 KB tavan);
  `responseReceived` bunları pending kayda `method`/`requestPostData` olarak taşıyor.
- `src/browser-network-capture.js` `normalizeBrowserNetworkRecord`: `requestPostData` beyaz listeye
  alındı. Sonuç: protobuf-POST ile manifest isteyen servislerde isteğin ne taşıdığı artık kayıt altında.

**B. Stremio OpenSubtitles-v3 anahtarsız sağlayıcı** (öneri §3, Etap 1)
- `src/browser-subtitle-search.js`: `target.imdbId` doğrulaması (`/^tt\d{5,10}$/`) — hem OS
  `imdb_id` parametresine hem yeni `searchStremioSubtitles` basamağına beslenir.
- Basamak davranışı: `MISSING_API_KEY` (anahtarsız kurulum) **veya** anahtarlı OS'in sıfır
  sonuç döndürmesi durumunda → `GET https://opensubtitles-v3.strem.io/subtitles/{movie|series}/…`
  Sonuçlar `provider:'stremio'` işaretli; dil filtresi uygulanır; `https:` olmayan satırlar elenir.
- `downloadSubtitle({fileId, url, provider})`: stremio/url yolu `approvedStremioUrl` allowlist'iyle
  (`*.strem.io`, `*.opensubtitles.com`, https, kimlik-bilgisiz, port yok) indirir; `config.fetch`
  enjekte edilebilir.
- Bağlantılar: `browser-feature-services.js` `subtitle-download` `url`/`provider` geçişi;
  renderer `bfImdb` form alanı (`index.html`) + `browser-features.js` arama/indirme parametreleri
  + sonuç satırında `· Stremio/OS` rozeti.
- Testler: `tests/browser-subtitle-search.test.js` +6 senaryo (anahtarsız→yalnız-Stremio,
  series yolu, OS-sıfır→basamak, indirme allowlist, kullanıcı-adı-smuggling reddi, geçersiz imdb).

**C. ffsubsync ses-referanslı senkron modu** (öneri §5, Etap 1 — sıfır yeni bağımlılık)
- `backend/browser_align.py`: `payload.audio` verildiğinde referans altyazı yerine medya yolu
  `ffsubsync <medya> -i target.srt` çalıştırılır; teşhis `method:'ffsubsync-audio-vad'`,
  `overlapBefore/After:null`, güven ortalama sapmadan (`<30sn → medium`).
- `src/browser-alignment.js`: `align({audioPath, targetCues})` — dosya varlığı doğrulanır.
- `src/browser-feature-services.js`: `'alignment-audio-preview'` — seçili referans videonun
  yolunu kullanır (480 sn tavan; uzun medya VAD'i ~1-2 dk sürebilir).
- `src/renderer/browser-analysis-tools.js`: "Videonun sesiyle senkron bul" düğmesi — fps/sürüm
  uyumsuzluğunda doğru-zamanlı ikinci altyazı bulmadan senkron önizlemesi. Uygulama akışı aynı
  (değişiklik listesi → taslak uygula, `autoApply:false` korunur).
- Testler: `backend/test_browser_align_audio.py` 3/3 (ffsubsync stub'ıyla medya yolu yönlendirmesi,
  eksik dosya reddi, altyazı-kipi regresyonu) — unittest keşfiyle ana süitte koşar.

## 4. Öneriler — ertelenenler ve gerekçe

| Öneri | Karar | Gerekçe |
|---|---|---|
| youtubei.js sağlayıcı katmanı | Erteleme — plan ayrı PR | 15.8 MB paket + `Platform.shim.eval` izolasyon tasarımı gerektirir (oyuncu JS'i güvenli sandbox'ta koşmalı); CJS'den dinamik import. Öneri dokümanının kendisi Etap 2 olarak işaretliyor — tek oturumda sorumlu biçimde yapılamaz; mimari tasarım PR'ı olarak takip edilmeli. |
| Kanal RSS abonelikleri | Erteleme — plan ayrı PR | `fast-xml-parser` yeni bağımlılığı + yerel-abonelik veri modeli + UI yüzeyi gerektirir; Etap 1'de listeli ama bu teslimin kapsamını aşıyor. |
| subliminal backend modülü | Erteleme | 10 sağlayıcılı merdiven anlamlı bir Etap-3 işi; Stremio basamağı anahtarsız kazanımın çoğunu zaten veriyor. |
| RYD/DeArrow minik istemcileri | Erteleme | Kart başına N ekstra istek fan-out'u + UI yerleşim kararı gerektiriyor ("minik istemci" kolay ama ürün etkisi tasarım sorusu). |
| MSE `appendBuffer` hook | Erteleme | Medya-düzeyi yakalama (altyazı değil); cat-catch deseninden kendi implementasyonumuz gerekir — Etap 4 derin iş. |
| better-sqlite3/Dexie cue deposu | Erteleme | Native rebuild + performans fixture'ı gerektiren mimari karar — Etap 5. |
| mediabunny, streamlink, web-scrobbler kalıpları, wavesurfer, defuddle, iconv-lite seti, aniskip, PeerTube captions, foliate-js vb. | Erteleme — değerli backlog | Etap sıralaması öneri dokümanında zaten var; bu dalda "gerçekten işe yarar + düşük eforlu" süzgeci yalnız yukarıdaki üç maddeyi seçti. |
| `electron-chrome-extensions`, ts-ebml, moonshine, edge-tts, node:sqlite | Reddedildi (öneri dokümanının kendi reddiyle uyumlu) | Lisans/bayrak/kararsızlık. |

## 5. Test kanıtları (bu dalda koşuldu)

- `tests/youtube-accounts.test.js` — 9/9
- `tests/youtube-auth-flow.test.js` — 4/4 (vm-slice IPC harness)
- `tests/browser-report126-regressions.test.js` — 4/4 (K1–K4)
- `backend/test_invidious_vtt.py` — 5/5
- `backend/test_browser_align_audio.py` — 3/3
- `tests/browser-subtitle-search.test.js` — tamamı geçti (+6 Stremio senaryosu)
- `tests/browser-alignment.test.js` — gerçek ffsubsync regresyonu geçti
- `tests/browser-network-capture.test.js` — 7/7
- `node --check` tüm değişen JS dosyaları + `py_compile` iki Python dosyası — temiz
- **Koşulmayanlar:** tam `npm test`, Electron smoke'ları (`electron-browser-analysis.smoke.js`
  dahil), gerçek Stremio/Google canlı uçlar, Windows el doğrulaması — PR sınırlarına bakınız.

## 6. Doğrulanamayan sınırlar

- Gerçek Stremio OS-v3 canlı ucu (`opensubtitles-v3.strem.io`) burada mock fixture'ıyla
  doğrulandı; endpoint şeması haze'nin canlı doğrulamasına dayanıyor — Windows'ta gerçek
  arama/indirme el kontrolü önerilir.
- ffsubsync ses modu stub'la yönlendirme düzeyinde test edildi; gerçek VAD kalitesi
  (uzun sessiz intro'lu bölümlerde `confidence:low` beklenir — `autoApply:false` korunur).
- postData yakalama birim testi CDP olay zinciri gerektirir; mock seviyesinde
  `normalizeBrowserNetworkRecord.requestPostData` doğrulandı, uçtan uca Electron smoke
  kapsamı dışında.
- Gerçek Google hesabıyla N1/N2/N3 akışları ancak Windows el kontrolüyle doğrulanabilir;
  burada vm-slice harness + birim testleriyle doğrulandı.
