# Kapsamlı Bug ve Geliştirme Raporu — 24.09.2026

**Kapsam:** whisper-browser v0.9.0-beta.1 (master @ 6e3c452) — ana süreç (`src/`), renderer (`src/renderer/`), Python backend (`backend/`)
**Yöntem:** Statik kod incelemesi + tam test paketinin koşulması + Electron bridge smoke + `tests/r92-deep/` fuzz dosyalarının elle koşulumu + şüpheli bulguların canlı `node -e` doğrulaması. **Hiçbir kod değiştirilmedi.**
**Değişiklik yapmadan yalnızca raporlamak üzere hazırlandı.**

---

## 0. Test Durumu (zemin bilgi)

| Süit | Sonuç |
|---|---|
| `node tests/run-all.js` (263 node + 25 python test dosyası = 288) | **TÜMÜ GEÇTİ** (exit 0) |
| `npm run test:electron-bridge` (CI-parite smoke) | **GEÇTİ** |
| `node tests/r92-deep/*.test.js` (4 dosya, **npm test kapsamı DIŞINDA** — bkz. N5) | Karışık: 6 doğrulanmış, 2'si bu turda çürütüldü (bkz. §4) |

Ana süit yeşil olduğu için aşağıdaki tüm bulgular **test kapsamı dışında kalan** statik bulgulardır. Bu, "testler geçiyor = bug yok" çıkarımının yanlış olduğunu da gösteriyor.

**Dürüstlük notu (yöntem sınırları):** Bu turda alt-ajan tabanlı geniş tarama bu ortamda çalıştırılamadı (ajanlar dosya okuyamadı). Derin inceleme, en yeni değişen kod (YouTube çoklu hesap R121/R122 + `fbcdeae` token-refresh düzeltmesi), güvenlik yüzeyi (`secret-store`, `local-file-access`, `settings:import`, XSS yüzeyi) ve önceki raporlardaki açık bugların tek tek doğrulanmasına odaklandı. **CEA/DASH ayrıştırıcılar, `pdf-translate`, `browser-manga`, `watch-index`, `media-catalog-*` gibi alanlar bu turda derin incelenemedi** — bir sonraki tur için önerilir.

---

## 1. Yeni Bulgular (bu turda bulundu ve doğrulandı)

### N1 — `youtube:poll` `_ytDevice` null yarışı: TypeError + çıkış yapılmış oturumun geri gelmesi
**Önem: ORTA · Dosya:** `src/main.js:2098-2134`

```js
const res = await runYoutubeCommand(          // 2104 — DAKİKALAR sürebilir
  ['poll', '--client-id', _ytDevice.tv ? 'tv' : ...], ...);
if (res && res.ok && res.data && (res.data.refresh_token || res.data.access_token)) {
  const up = ytAccounts.upsertAccount(...);    // 2116 — _ytDevice kontrolü YOK
  ...
  authMode: _ytDevice.tv ? 'tv' : 'custom',   // 2122 — _ytDevice burada null olabilir
```

`youtube:logout` (`src/main.js:2205`) ve `youtube:cancel` (`src/main.js:2221`) poll sürerken `_ytDevice = null` yapar ve süreci öldürür. Süreç öldürülmeden hemen önce tam bir `login` sonucu ayrıştırıldıysa `runYoutubeCommand` `{ok:true, data:…}` ile resolve olur ve:

1. **2116. satırdaki `upsertAccount` çalışır** → kullanıcının az önce kapattığı hesap bellekte geri yüklenir ("hayalet hesap"). `persistYoutubeSession()` (2127) throw nedeniyle atlanır; ancak `accountSwitch`/`setClient`/sonraki girişler gibi herhangi bir persist anında hayalet hesap diske yazılır.
2. **2122. satırda `_ytDevice.tv` → TypeError** (`null.tv`) → IPC reddi; renderer'a "Onay tamamlanamadı" yerine işlenmemiş reddi döner.

**Düzeltme:** `tvMode`'u `await` ÖNCESİ yerel sabite al (2105. satırda zaten hesaplanıyor); `await` sonrası `_ytDevice` null ise (iptal/çıkış) upsert'i tamamen atla. Regresyon testi: poll sonuç döndürmeden logout tetikleyip upsert'in atlandığını doğrula.

### N2 — Hesap kimliği `_fetch_me` başarısızsa zaman damgasına düşüyor → her girişte kopya hesap satırı
**Önem: ORTA · Dosyalar:** `backend/youtube.py:288-302,177-183,261-267`, `src/youtube-accounts.js:24-30,59-84`, `src/main.js:2116-2124`

`_fetch_me` her hata durumunda `None` döner (`backend/youtube.py:300-302`), çağıranlar `user = _fetch_me(...) or {}` ile boş isim/e-postaya düşer. `accountIdFor('','')` ise `acct-<Date.now()>` üretir — **her giriş, mevcut hesabı güncellemek yerine YENİ bir hesap satırı oluşturur.** Aynı Google hesabı için liste, çalışır ama isimsiz kopya satırlarla dolar; hepsinin geçerli refresh token'ı vardır.

İki ek kusur (aynı kökten):
- `userEmail` **hiçbir giriş akışında dolmuyor**: `_fetch_me` channels endpoint kullanıyor ve `{"name": başlık, "email": ""}` döndürüyor — e-posta alanı yapısal olarak hep boş.
- Kimlik kanal **başlığına** bağlı: kanal yeniden adlandırılırsa bir sonraki giriş yeni id üretir, eski satır sahipsiz kalır (token'ı geçerli kalır).

**Düzeltme:** Kimlik bilgisi yoksa tek bir kararlı `unknown` id'de birleştir ve `me` başarılı olunca hesabı yeni kimlikle yeniden adlandır; en sağlamlı, kimliği kanal **ID'sine** (channels endpoint `mine=true` döndürüyor) bağlamak. E-posta alanını ya kaldırın ya da `userinfo.email` scope ekleyip doldurun.

### N3 — `youtube:accountRemove` revoke'ı çalışan poll bloklayabiliyor → Google grant'ı canlı kalıyor
**Önem: DÜŞÜK · Dosya:** `src/main.js:2195-2209`

`youtube:logout` poll'u öldürür (`mediaJobs.youtubeAuth` terminate, 2180-2206), ama `youtube:accountRemove` öldürmez. 30 dakikalık bir cihaz-kodu onay bekleşi sürerken hesap silinirse revoke `runYoutubeCommand`'ın tek-slot reddine takılır (`'Bir YouTube işi zaten çalışıyor.'`), hesap yerelden silinir ama **Google tarafındaki grant iptal edilmez** (`remoteOk:false`). Kullanıcıya da "revoke başarısız" bilgisi gösterilmiyor.

**Düzeltme:** `accountRemove` da akışı iptal etsin (logout ile aynı terminate) ya da revoke'u slot boşalınca kuyruğa alsın; `remoteOk:false` durumunu UI'da açıkça bildirsin.

### N4 — `upsertAccount` ölü parametre ve sessiz 3600 varsayımı
**Önem: DÜŞÜK · Dosya:** `src/youtube-accounts.js:66-84`

- `activeId` parametresi fonksiyon gövdesinde hiç kullanılmıyor (ödük parametre, arayanlarda yanlış güven izlenimi).
- `Date.now() + (Number(patch.expiresIn) || 3600) * 1000` — `expiresIn: 0` veya `NaN` geldiğinde sessizce 1 saat varsayılır; `0` "token bitti" anlamına gelmez ama öyle yorumlanır.

**Düzeltme:** Parametreyi kaldır ya da kullan; `expiresIn` için `Number.isFinite` kontrolü + 0'ı reddet.

### N5 — `tests/r92-deep/` fuzz paketi `npm test` kapsamı dışında
**Önem: DÜŞÜK (süreç) · Dosya:** `tests/run-all.js:21` + `tests/r92-deep/` (4 dosya, izlenmeyen)

`run-all.js` yalnız `tests/` kökündeki `*.test.js` dosyalarını glob'luyor; `tests/r92-deep/*.test.js` **asla koşmuyor**. Bu dosyalar önceki denetim turlarında yazılmış, içlerinde hem doğrulanmış gerçek buglar (R93-05, R93-06b) hem de hatalı beklentiler (R93-02, R93-08 — bkz. §4) var. Şu an hiçbiri CI'da doğrulanmıyor.

**Düzeltme:** Beklentileri düzeltip (çürütülenler silinip) sürecin ana pakete alınması; en azından CI'da ayrı bir "fuzz" job'u.

### N6 — `youtube:browse` 150 ms'lik busy-wait döngüsü
**Önem: BİLGİ · Dosya:** `src/main.js:2169-2175`

```js
while (mediaJobs.youtube && Date.now() < deadline) {
  await new Promise((r) => setTimeout(r, 150));
}
```

Slot boşalması 150 ms aralıklı yoklammayla bekleniyor (10 sn'e kadar). Doğru çalışıyor; olay güdümlü (slot boşalınca resolve olan promise) hale getirilmesi hem gecikmeyi düşürür hem N3 sınıfı slot sorunlarını soyutlamada çözer.

---

## 2. Bilinen-Açık Bulgular (önceki raporlarda belgeli — bugün kodda hâlâ mevcut olarak doğrulandı)

| # | Bulgu | Dosya:satır | Kaynak rapor | Bugünkü durum |
|---|---|---|---|---|
| K1 | `MAX_MEDIA_TIME_SECONDS = 60 * 60 * 1000` — saniye alanında 3.600.000 sn (1000 saat) üst sınır; ms↔sn birim karışıklığı. `position`/`duration` clamp'ı anlamsız değerleri geçirir | `src/browser-session-store.js:18`, `src/browser-tab-history.js:7` | R95-02 / R93-14 (P1) | **Açık — doğrulandı** |
| K2 | `validateBrowserSubtitleDocument`: beklenen ve ayrıştırılan liste **ikisi de boşsa** `parsed.length !== expected.length` geçer, `every()` boş dizide `true` döner → boş altyazı dışa aktarımı `ok:true` | `src/browser-subtitle-output.js:35-53` | B29-04 (Orta) | **Açık — doğrulandı** |
| K3 | `splitBrowserBounds({})` — `!rawBounds` kontrolü `{}`'yi geçirir; `Number(undefined)||0` ile 1×1'lik anlamsız yerleşim döner (null yerine) | `src/browser-tab-layout.js:21-24` | R93-05 (P3) | **Açık — doğrulandı** |
| K4 | `setPath` ara düğümü dizi olduğunda `current[part] = {}` ile **diziyi ezer** → 3 seviyeli derin secret yolunda veri kaybı. Varsayılan alanlar 2 seviyeli olduğundan etki bugün sınırlı | `src/secret-store.js:55` | R93-06b / R95-10 (P2) | **Açık — mekanizma doğrulandı** |
| K5 | `SubtitleFileAccess` grant'ları yalnız bellekte — uygulama yeniden başlayınca seçilen altyazı dosyaları için yeniden izin gerekir | `src/local-file-access.js:33` | B29-01 (Kritik notu) | **Açık** — kasıtlı güvenlik tercihi olarak görünüyor; kararlanıp dokümante edilmeli |
| K6 | `assembleCueSentences` gap sınırı strict `>` (backend ile sınır semantiğinin hizalanması) | `src/browser-translation-scheduler.js:108` | R95-03 | **Açık** — nokta ile biten cue'da bölünme `sentenceEnded` semantiğinden (bkz. §4, R93-08 çürütmesi); backend sınırıyla hizalama kararı bekliyor |

Ayrıca `docs/BUG_RAPORU.md`, `docs/BUG_REPORT.md` (B001–B168), `docs/KOD_DENETIM_VE_BUG_RAPORU_2026.md` ve `docs/devir/2026-09-20-*.md` derlemelerinde listelenen ve bu turda tek tek yeniden doğrulanamayan çok sayıda açık bulgu var (tarayıcı kısayollarının arka plan videosunu tetiklemesi, `stepCue(-1)` sessizlikte ilerleme, VTT ms kırpma → kayıt reddi, tam ekranda altyazı katmanı, HLS/DASH zaman ötelemesi, diarization `merge_continuation` indeks kayması vb.). Bunlar §5'teki düzeltme planına "doğrulanacak açık borcu" olarak alınmıştır.

---

## 3. Bu Turda "Düzeltildi / Çürütüldü" Olarak Doğrulananlar (önceki raporlara göre iyi haber)

| Bulgu | Kaynak | Bugünkü durum |
|---|---|---|
| `normalizeBrowserEventContext(null)` TypeError | R95-01 / R93-01 (P1) | **Düzeltildi** — `browser-event-envelope.js:8-11` null-guard'lı |
| `browser-fonts.js` finally bloğunun birincil hatayı ezmesi + temp klasör silinmemesi | R92-01 (P1) | **Düzeltildi** — `src/browser-fonts.js:20-23` (`if (!primaryError) throw cleanupError`) |
| `transformCuesForExport` içindeki `normalizeTransform` throw'unun yakalanmaması | B29-02 (Kritik) | **Etkisiz** — çağıran `runBrowserSubtitleExport` try/catch sarmalıyor (`renderer.js:9404-9412`) |
| `persistedMediaId.split(':')` kimlik bozulması | R92-02 (P2) | **Düzeltildi** — `browser-session-store.js:195-199` `:url:` ayrımı ile |
| `settings:import` dizileri kabul ediyor | KOD_DENETIM raporu | **Düzeltildi** — `main.js:17124-17216` doğrulama + endpoint değişim onayı |
| Watch klasörünün yalnız `<ad>.srt` araması | KOD_DENETIM raporu | **Düzeltildi** — `main.js:1362` çoklu uzantı |
| R93-02 "IDN/punycode origin reddediliyor" | r92-deep fuzz | **ÇÜRÜTÜLDÜ** — canlı test: `permissionOrigin('https://xn--ecekirdek-1hb.tr/')` → kabul; unicode URL de punycode origin'e çevrilip kabul ediliyor. Test beklentisi hatalı |
| R93-08 "gap=0.5, maxGap=1'de cümleler birleşmiyor" | r92-deep fuzz | **ÇÜRÜTÜLDÜ** — canlı test: `['Hello','World.']` → tek cümle. İki cümle çıkaran durum, ilk cue'un **noktayla bitmesi** (`sentenceEnded` → kasıtlı bölme). Test beklentisi hatalı |

---

## 4. Güvenlik Yüzeyi Notları (bu turda olumlu doğrulananlar)

- **Renderer XSS durumu iyi:** `escapeHtml` beş karakteri de escaped ediyor (`renderer.js:1218-1225`); SmartTube kartları, yorumlar, kuyruk satırları DOM API + `textContent` ile kuruluyor; `absThumb` yalnız http(s) küçük resim URL'lerine izin veriyor (`renderer.js:24485-24491`); kart `data-video-id` seçicileri `CSS.escape` ile kuruluyor.
- **`local-file-access.js`** yol doğrulaması sıkı: mutlak yol zorunlu, kontrol karakterleri, Windows sürücü iki nokta istismarı, `\\?\` öneki reddi, symlink/ADS için `realpathSync`, uzantı beyaz listesi + boyut sınırları, PDF imza kontrolü.
- **Token sözleşmesi korunuyor:** YouTube token'ları renderer'a çıkmıyor; `persistableAccounts` access token'ı diske yazmıyor; `settings:export` `redactExport` ile sırları dışarı vermiyor.
- **`accountRemove` revoke'u** hesabın KENDİ token'ıyla yapılıyor (aktif hesabınkiyle değil) — doğru desen; tek sorun N3'teki slot çakışması.

---

## 5. Düzeltme Planı (öncelik sıralı)

### P0 — Hemen (~0,5 gün)
1. **N1** `youtube:poll` yarışı: `tvMode`'u `await` öncesi yakala; `await` sonrası `_ytDevice === null` ise (iptal/çıkış) upsert + persist atla. + Regresyon testi (`youtube-account-refresh-race.test.js` yanına).
2. **N3** `youtube:accountRemove`: poll/akış iptali + revoke kuyruğu + `remoteOk:false` kullanıcı bildirimi.

### P1 — 1-2 gün
3. **N2** hesap kimliği: kimlik yoksa kararlı `unknown` birleştirme veya kanal-ID kimliği; `me` başarısını bekleme (fire-and-forget değil, gecikmeli yeniden adlandırma); e-posta alanı kararı.
4. **K1** zaman sabitleri: `MAX_MEDIA_TIME_SECONDS`'u gerçek saniye cinsinden tanımla (örn. `24 * 60 * 60`) ve ms değer girişlerine birim testi ekle (her iki dosyada).

### P2 — aynı sprint içinde
5. **K2** boş cue listesinde doğrulamayı reddet (`parsed.length === 0 && expected.length === 0 → ok:false`).
6. **K3** `splitBrowserBounds({})` → `null` (boş nesne için anahtar kontrolü).
7. **K4** `setPath`'te ara düğüm diziyse ya üstte birleştir ya hataya dön (veri kaybını engelle).
8. **N5** `r92-deep` paketini temizle (çürütülen R93-02/R93-08 beklentilerini çıkar, kalanları süite al).

### P3 — backlog
9. **N4** ölü parametre/`expiresIn` temizliği.
10. **N6** slot boşalmasını olay güdümlü yap; `mediaJobs` için küçük kuyruk soyutlaması.
11. Modülerleştirme: `renderer.js` (26.8k satır), `main.js` (17.9k), `transcribe.py` (7.7k) — öncelik `main.js` IPC handler'larının kayıt-defterine alınması.
12. Depo hijyeni: `_repro/` (58 dosya), `docs/devir/`, kökteki `PROGRAM_BUG_REPORT_8*.md`, boş dizinler (`.uiprevni-test/`, `does-not-exist-test-12345/`, iç içe `Whisper Local/`) — arşivle/temizle.
13. CI: `node --check` yalnız 3 dosyada — tüm `src/**/*.js`'e genişlet.
14. Bu turda derin incelenemeyen alanlar için ikinci tur: CEA/DASH ayrıştırıcılar, `pdf-translate`, `browser-manga`, `watch-index`, `media-catalog-*`, `browser-page-translate` (1.4k satır).

---

## 6. Geliştirme Önerileri (özet)

1. **Zaman birimleri politikası:** `SECONDS_PER_HOUR` tarzı adlandırılmış sabitler + tek kaynak; K1 sınıfı ms/sn karışıklıkları böyle önlenir.
2. **Fuzz testlerini ana pakete almak:** r92-deep'teki çürütülmüş beklentiler ayıklandığında kalan fuzz'lar gerçek değer üretir (R93-05/K3 ve R93-06b/K4 zaten böyle bulundu).
3. **YouTube hesap modeli:** kimlik = kanal ID; görünen ad ayrı; e-posta ya doldur ya kaldır. `accountList`'e "son kullanıldı" damgası ekle (kopya/ölü satır tespiti için).
4. **Slot/kuyruk soyutlaması:** `mediaJobs`'ın elle yönetilen slot'ları (N3, N6, R121-03'te düzeltilen kilitlenmeler) tek bir "izinli iş kuyruğu" ile değiştirilebilir; her yeni slot eklendiğinde aynı hata sınıfı tekrar ediliyor.
5. **Test kapsama boşlukları:** `docs/devir/2026-09-20-1555.md`'deki "test edilmeyen 40 modül" listesi güncellenip kapama planına alınmalı.
6. **CI'da Windows matrisi zaten var ve çalışıyor** (iyi) — r92-deep'i de eklemek madde 2 ile birlikte düşük maliyetli.
7. **Dokümantasyon:** `docs/` altındaki onlarca tarihli denetim raporu bir "durum panosu"na (açık/kapalı tek tablo) indirgenebilir; bu rapor §2/§3 tablolarıyla o panonun çekirdeğini veriyor.

---

## 7. Bu Raporda Kullanılan Kanıt Komutları

- `node tests/run-all.js` → "Tüm testler geçti" (exit 0)
- `npm run test:electron-bridge` → geçti
- `node tests/r92-deep/adversarial-fuzz-v2.test.js` → 31 geçti / 3 başarısız / 6 doğrulanmış bug (kendi özeti)
- `node -e "…permissionOrigin('https://xn--ecekirdek-1hb.tr/')…"` → punycode kabul (R93-02 çürütme)
- `node -e "…assembleCueSentences([{text:'Hello'},{text:'World.'}],{maxGap:1})…"` → tek cümle (R93-08 çürütme)
- `git show fbcdeae`, `git show 0937c7f` — YouTube çoklu hesap değişikliklerinin satır satır incelemesi

*Rapor tarihi: 24.09.2026 · İnceleyen: Haze Code (kod değişikliği yapılmadı)*
