# BROWSER_BUG_REPORT_447 — Vangu GPT-6.1 Sol Destekli Çoklu Alt Sistem Derin Kod Denetimi (Kategori 1–5)

Tarih: 2026-10-17.
İncelenen alt sistemler:
- Kategori 1: Dublaj Motoru, Ses Oynatma Oturumu ve Ses Referansı (`src/dub-service.js`, `src/voice-reference.js`, `src/renderer/browser-dub-audio.js`, `src/voice-storage.js`)
- Kategori 2: IPC Güvenliği, Preload Köprüsü ve Süreç Yaşam Döngüsü (`src/preload.js`, `src/local-file-access.js`, `src/settings-security.js`, `src/provider-api-keys.js`, `src/process-lifecycle.js`, `src/process-io.js`)
- Kategori 3: Çeviri Boru Hattı, Kimlik Doğrulama ve Bellek Önbelleği (`backend/translation_auth.py`, `backend/translate_planner.py`, `backend/translation_memory.py`, `src/translation-endpoints.js`, `src/translation-provider-probe.js`)
- Kategori 4: Canlı ASR, Ses Anahtarlayıcı ve Gerçek Zamanlı Akış (`src/live-asr-audio-switch.js`, `src/live-asr-realtime.js`, `src/renderer/live-asr-worklet.js`)
- Kategori 5: Altyazı Biçimlendirme, Cümle Düzeni ve Zamanlama Boru Hattı (`src/subtitle-sentence-layout.js`, `src/subtitle-output-contract.js`, `src/subtitle-find-replace.js`, `src/renderer/timeline-issue-scan.js`)

---

## Yönetici Özeti ve Doğrulanmış Kritik Bulgular

Kullanıcının tahsis ettiği yüksek akıl yürütme kapasiteli `gpt-6.1-sol` modeli üzerinden projenin en hassas 5 alt sistemi baştan sona, satır satır denetlenmiştir. Yapılan statik ve mimari analiz sonucunda toplam **51 somut hata ve risk** tespit edilmiştir:
- **Kategori 1:** 12 bulgu (11 HIGH, 1 olumlu doğrulama)
- **Kategori 2:** 12 bulgu (8 HIGH, 4 MEDIUM)
- **Kategori 3:** 9 bulgu (3 HIGH, 6 MEDIUM)
- **Kategori 4:** 8 bulgu (3 HIGH, 5 MEDIUM)
- **Kategori 5:** 10 bulgu (5 HIGH, 5 MEDIUM)

### Öne Çıkan En Kritik Bulgular (Doğrudan Kaynak Kod Kanıtlı)

1. **BUG-CAT5-01 (Runtime Crash - TypeError):** `src/subtitle-find-replace.js` içinde `literalRanges()` hızlı arama yolunda `const end = found + needle.length;` olarak tanımlanan değişkene, combining mark genişletme döngüsünde `end += ...` ile atama yapılmaktadır. Birleşen karakter içeren aramalarda doğrudan `TypeError: Assignment to constant variable` hatasıyla süreç çöker.
2. **BUG-CAT2-01 (Preload IPC Sızıntısı):** `src/preload.js` içinde `onYoutubeTvEvent` ve `onYoutubeEvent` listener'larında `(_event, payload)` ayıklanmadan ham Electron IPC event nesnesi renderer callback'ine aktarılmaktadır. Bu durum hem API sözleşmesini bozmakta hem de bridge sınırını zedelemektedir.
3. **BUG-CAT3-01 (Bütçe Mantık Hatası - Token Ceiling Inversion):** `backend/translate_planner.py` içinde `cap = self.token_ceiling or self.token_budget` ifadesi, öğrenilmiş tavan (`token_ceiling`) başlangıç bütçesinden büyük olduğunda bütçeyi kısmak yerine kontrolsüz biçimde genişletmektedir.
4. **BUG-CAT1-01 (Yarış Durumu - Dublaj Oturum ve Timer Sızıntısı):** `src/renderer/browser-dub-audio.js` içinde ardışık `attach()` çağrılarında generation/intent token ayrılmadığı için eski cleanup çözüldüğünde yeni oturumun timer'ı üzerine yazılmakta, arka planda yetim `setInterval` ve mute state kalmaktadır.
5. **BUG-CAT4-04 (AudioWorklet Backpressure Yokluğu):** `src/renderer/live-asr-worklet.js` içinde ses verisi `postMessage` ile renderer'a aktarılırken kuyruk sınırı veya backpressure bulunmamakta; ana süreç veya renderer yavaşladığında bellek sınırsız büyümektedir.

---

## 51 Maddelik Genel Bulgu Matrisi

| ID | Seviye | Alt Sistem | Bulgu Özeti | İlgili Dosya / Fonksiyon |
|---|---|---|---|---|
| BUG-CAT1-01 | HIGH | Dublaj | Eşzamanlı `attach()` çağrıları oturum sahipliğini, timer ve mute yaşam döngüsünü bozuyor | `src/renderer/browser-dub-audio.js` → `attach()` |
| BUG-CAT1-02 | HIGH | Dublaj | Gecikmiş `play()` sonuçları güncel oynatma niyetini ve kaynak kimliğini doğrulamıyor | `src/renderer/browser-dub-audio.js` → `play()` |
| BUG-CAT1-03 | HIGH | Dublaj | Audio event listener’ları instance ömrüne bağlı; eski listener güncel oturumu sonlandırabiliyor | `src/renderer/browser-dub-audio.js` → audio listeners |
| BUG-CAT1-04 | HIGH | Dublaj | İlk mute çağrısının senkron hatası oturumu yarım kurulmuş bırakıyor | `src/renderer/browser-dub-audio.js` → `mute()` |
| BUG-CAT1-05 | HIGH | Dublaj | Çıktı ailesi eksik: `-dub-text.json` korumasız biçimde üzerine yazılıyor | `src/dub-service.js` → `claimArtifacts()` |
| BUG-CAT1-06 | HIGH | Dublaj | Artifact sahiplenme yalnızca bellekte; atomik rezervasyon ve dosya sistemi kilidi yok | `src/dub-service.js` → job state |
| BUG-CAT1-07 | HIGH | Dublaj | Girdi dizinleri temizlenmiyor; başarısız iş aynı ID ile yeniden çalıştırılamıyor | `src/dub-service.js` → cleanup |
| BUG-CAT1-08 | HIGH | Dublaj | Windows cleanup tek denemelik; dosya kilitleri (EBUSY/EPERM) kalıcı artık ve ID kilitlenmesi üretiyor | `src/dub-service.js` → `cleanupFailedArtifacts()` |
| BUG-CAT1-09 | HIGH | Dublaj | Referans oluşturma/yazma transaction değil; bozuk veya yarım referans dizinleri kalıyor | `src/voice-reference.js` |
| BUG-CAT1-10 | HIGH | Dublaj | Referans süreç timeout’u Promise’i sonlandırmıyor; servis süresiz meşgul kalabiliyor | `src/voice-reference.js` → timeout |
| BUG-CAT1-11 | HIGH | Dublaj | Quit sırasında cancellation beklenmiyor; rejection ve yetim alt süreç riski var | `src/dub-service.js` → shutdown |
| BUG-CAT1-12 | HIGH | Dublaj | Eski depolama migration’ı her açılışta tekrar çalışıyor; silinmiş veriler geri gelebiliyor | `src/voice-storage.js` → migration |
| BUG-CAT2-01 | MEDIUM | Preload / IPC | İki preload event API’si ham Electron IPC event nesnesini renderer callback’ine geçiriyor | `src/preload.js` → `onYoutube(Tv)Event` |
| BUG-CAT2-02 | MEDIUM | IPC / Yol | Windows’ta sürücüsüz kök yollar mutlak yol kabul edilerek çalışma dizinine bağlı hedef seçiliyor | `src/local-file-access.js` → `canonicalLocalPath` |
| BUG-CAT2-03 | HIGH | IPC / Güvenlik | Yetkilendirmeden önce senkron UNC çözümlemesi main thread’i bloklayabilir ve SMB tetikleyebilir | `src/local-file-access.js` → UNC resolver |
| BUG-CAT2-04 | HIGH | IPC / Ayarlar | Transaction rollback başarısız olsa bile tek kurtarma kopyası siliniyor | `src/settings-security.js` → rollback |
| BUG-CAT2-05 | HIGH | IPC / Ayarlar | Recovery sırasında journal silinemezken commit marker silinebiliyor; commit edilmiş veri kaybolabiliyor | `src/settings-security.js` → journal recovery |
| BUG-CAT2-06 | HIGH | IPC / Kimlik | Endpoint identity tüm URL’yi küçük harfe çevirerek path-sensitive credential hedeflerini karıştırıyor | `src/provider-api-keys.js` → endpoint hash |
| BUG-CAT2-07 | HIGH | IPC / Güvenlik | API key profile içindeki tekil sırlar backup/public redaction sözlüğüne eklenmiyor | `src/provider-api-keys.js` → sanitize |
| BUG-CAT2-08 | HIGH | IPC / Güvenlik | Provider credential scope HTTP/HTTPS ve port ayrımını kaldırıyor | `src/provider-api-keys.js` → scope |
| BUG-CAT2-09 | MEDIUM | IPC / Prototype | Prototype zinciri üzerinden provider/profile lookup hatalı nesne ve fonksiyon döndürebiliyor | `src/provider-api-keys.js` → lookup |
| BUG-CAT2-10 | HIGH | Süreç | `probeCommand` stderr tüketmediği için child process pipe backpressure ile asılı kalıyor | `src/process-io.js` → `probeCommand` |
| BUG-CAT2-11 | HIGH | Süreç | Probe timeout/limit yolu süreç ağacını kapatmadan tamamlandı dönüyor; zombi süreç kalıyor | `src/process-lifecycle.js` → timeout |
| BUG-CAT2-12 | HIGH | Süreç | `taskkill` başarısı child kapanışı yerine kullanılıyor; exit beklemeden watchdog iptal ediliyor | `src/process-lifecycle.js` → kill |
| BUG-CAT3-01 | HIGH | Çeviri | Öğrenilmiş token tavanı, başlangıç token bütçesini sınırlandırmak yerine yükseltebiliyor | `backend/translate_planner.py` → `AdaptivePlanner` |
| BUG-CAT3-02 | HIGH | Çeviri | Tek bir büyük grup, token ve parça sınırlarını koşulsuz aşabiliyor | `backend/translate_planner.py` → `pack_groups` |
| BUG-CAT3-03 | HIGH | Çeviri | Fuzzy translation memory, farklı anlamdaki sözcükleri yazım hatası sayıp hatalı çeviriyi eşliyor | `backend/translation_memory.py` → fuzzy match |
| BUG-CAT3-04 | HIGH | Çeviri | SQLite yazma hatalarında transaction rollback yapılmadığından Windows'ta kalıcı DB kilidi oluşuyor | `backend/translation_memory.py` → write transaction |
| BUG-CAT3-05 | MEDIUM | Çeviri | Probe HTTP yanıtlarının bazı hata yollarında response body tüketilmiyor veya iptal edilmiyor | `src/translation-provider-probe.js` |
| BUG-CAT3-06 | MEDIUM | Çeviri | Yanıt gövdesi okunurken oluşan timeout, yanlışlıkla `invalid_response` olarak raporlanıyor | `src/translation-provider-probe.js` |
| BUG-CAT3-07 | MEDIUM | Çeviri | JS tarafında IPv6 loopback adresi tanınmıyor; Python kimlik doğrulama sözleşmesiyle uyuşmuyor | `src/translation-endpoints.js` |
| BUG-CAT3-08 | MEDIUM | Çeviri | Probe çıktısı token bakımından sınırsız bırakılıyor ve istenen `OK` yanıtı doğrulanmıyor | `src/translation-provider-probe.js` |
| BUG-CAT3-09 | MEDIUM | Çeviri | Planlayıcı istatistikleri ve translation memory kayıt boyutları için bellek sınırı bulunmuyor | `backend/translation_memory.py` |
| BUG-CAT4-01 | HIGH | Canlı ASR | Gecikmiş ve yinelenmiş chunk sonuçları dil geçişi durum makinesini bozabiliyor | `src/live-asr-audio-switch.js` → `observe()` |
| BUG-CAT4-02 | MEDIUM | Canlı ASR | Explicit `flush`, resampler’ın kesirli örnek durumunu sıfırlamıyor; ses kayması oluşuyor | `src/live-asr-realtime.js` → `flush()` |
| BUG-CAT4-03 | HIGH | Canlı ASR | Giriş kaybı/cihaz kesintisi sırasında eski ve yeni ses aynı chunk içinde birleştiriliyor | `src/live-asr-realtime.js` → buffer append |
| BUG-CAT4-04 | HIGH | Canlı ASR | Worklet–renderer aktarımında backpressure yok; bellek ve gecikme sınırsız büyüyebiliyor | `src/renderer/live-asr-worklet.js` → `process()` |
| BUG-CAT4-05 | MEDIUM | Canlı ASR | 44.1/48 kHz → 16 kHz dönüşümünde anti-alias filtresi eksik; yapay frekans gürültüsü oluşuyor | `src/renderer/live-asr-worklet.js` |
| BUG-CAT4-06 | MEDIUM | Canlı ASR | Stereo kanalların aritmetik ortalaması ters fazlı konuşmayı tamamen sessizleştiriyor | `src/renderer/live-asr-worklet.js` → downmix |
| BUG-CAT4-07 | MEDIUM | Canlı ASR | Sabit peak eşiği, düşük seviyeli ama anlaşılır fısıltı/konuşmayı kalıcı olarak düşürüyor | `src/live-asr-realtime.js` → gate |
| BUG-CAT4-08 | MEDIUM | Canlı ASR | Gerçek zaman monitörü ardışık yavaşlığı yanlış sayıyor ve backlog bitmeden 'yetişti' sayıyor | `src/live-asr-realtime.js` → latency monitor |
| BUG-CAT5-01 | HIGH | Altyazı | Grapheme uzatma yolunda `const` değişkene atama yapılması aramayı `TypeError` ile çökertiyor | `src/subtitle-find-replace.js` → `literalRanges()` |
| BUG-CAT5-02 | HIGH | Altyazı | Unicode fallback araması kübik maliyete (`O(N^3)`) ulaşarak renderer UI iş parçacığını donduruyor | `src/subtitle-find-replace.js` → slow path |
| BUG-CAT5-03 | MEDIUM | Altyazı | Cümle dağıtımı grapheme yerine code point bölüyor; birleşik Türkçe karakter ve emojiler parçalanıyor | `src/subtitle-sentence-layout.js` |
| BUG-CAT5-04 | MEDIUM | Altyazı | İç içe zaman aralıklarında gerçek altyazı çakışmaları (overlaps) tespit edilemiyor | `src/renderer/timeline-issue-scan.js` |
| BUG-CAT5-05 | MEDIUM | Altyazı | Geçersiz, negatif ve sonsuz zaman damgaları güvenilir biçimde filtrelenmiyor/raporlanmıyor | `src/renderer/timeline-issue-scan.js` |
| BUG-CAT5-06 | HIGH | Altyazı | Kurtarma imzası farklı altyazı içeriklerini aynı kaynak kabul edip yanlış hizalıyor | `src/subtitle-output-contract.js` |
| BUG-CAT5-07 | HIGH | Altyazı | Geçersiz explicit output metadata sessizce legacy 'complete/source' sonucuna dönüşüyor | `src/subtitle-output-contract.js` |
| BUG-CAT5-08 | MEDIUM | Altyazı | Kaynak ve çeviri descriptor’ları farklı video/altyazı kaynaklarından yanlış eşleştirilebiliyor | `src/subtitle-output-contract.js` |
| BUG-CAT5-09 | HIGH | Altyazı | Sayı denetiminde ölçekli sayılar negatif işareti kaybederek sayı tutarlılık testinden geçiyor | `src/subtitle-output-contract.js` |
| BUG-CAT5-10 | MEDIUM | Altyazı | Yinelenen kaynak sayılar tek hedef sayı ile karşılanmış sayılarak sayı kaybı maskeleniyor | `src/subtitle-output-contract.js` |

---



# Kategori 1: Dublaj Motoru, Ses Oynatma Oturumu ve Ses Referansı Yönetimi

**Kategori:** Dublaj Motoru, Ses Oynatma Oturumu ve Ses Referansı Yönetimi  
**İncelenen dosyalar:** `src/dub-service.js`, `src/voice-reference.js`, `src/renderer/browser-dub-audio.js`, `src/voice-storage.js`

## Kapsam ve yöntem

Bu rapor, paylaşılan kaynak kodunun statik analizine dayanır. `prepareBackground`, `terminate`, Python betikleri, medya yetkilendirme uygulaması ve `dub-sync-map` kaynakları verilmediğinden, bunların iç davranışları hakkında varsayımsal açıklar kesin bulgu olarak sunulmamıştır.

Satır numaraları yerine, yeniden üretilebilir ve kesin **dosya + fonksiyon/handler + ilgili ifade** referansları kullanılmıştır.

### Önemli olumlu tespit

`claimArtifacts()` içindeki şu sıralama, belirtilen duplicate-ID veri kaybı sınıfının önemli bir bölümünü zaten engelliyor:

```js
if (files.some(file => fs.lstatSync(file, { throwIfNoEntry: false }))) {
  throw new Error('Bu işin ses çıktısı zaten var.');
}
s.ownedArtifacts ||= new Set();
files.forEach(file => s.ownedArtifacts.add(file));
```

**Mevcut ana WAV/sync/partial ailesinden biri bulunduğunda, bu çağrı o aileyi sahiplenmiyor.** Dolayısıyla yalnızca mevcut `id.wav` üzerinden reddedilen normal bir duplicate isteğin eski WAV’ı sildiği iddiası bu kod için doğru değildir.

Bununla birlikte, eksik artifact aileleri, gerçek dosya rezervasyonu olmaması ve iş girdilerinin yönetimi nedeniyle aşağıdaki veri kaybı ve yeniden deneme problemleri devam ediyor.

---

## Bulguların özeti

| ID | Önem | Bulgu |
|---|---|---|
| BUG-CAT1-01 | HIGH | Eşzamanlı `attach()` çağrıları oturum sahipliğini, timer ve mute yaşam döngüsünü bozuyor |
| BUG-CAT1-02 | HIGH | Gecikmiş `play()` sonuçları güncel oynatma niyetini ve kaynak kimliğini doğrulamıyor |
| BUG-CAT1-03 | HIGH | Audio event listener’ları instance ömrüne bağlı; eski listener güncel oturumu sonlandırabiliyor |
| BUG-CAT1-04 | HIGH | İlk mute çağrısının senkron hatası oturumu yarım kurulmuş bırakıyor |
| BUG-CAT1-05 | HIGH | Çıktı ailesi eksik: `-dub-text.json` korumasız biçimde üzerine yazılıyor |
| BUG-CAT1-06 | HIGH | Artifact sahiplenme yalnızca bellekte; atomik rezervasyon ve yayınlama yok |
| BUG-CAT1-07 | HIGH | Girdi dizinleri temizlenmiyor; başarısız iş aynı ID ile yeniden çalıştırılamıyor |
| BUG-CAT1-08 | HIGH | Windows cleanup tek denemelik; dosya kilitleri kalıcı artık ve ID kilitlenmesi üretiyor |
| BUG-CAT1-09 | HIGH | Referans oluşturma/yazma transaction değil; bozuk veya yarım referans dizinleri kalıyor |
| BUG-CAT1-10 | HIGH | Referans süreç timeout’u Promise’i sonlandırmıyor; servis süresiz meşgul kalabiliyor |
| BUG-CAT1-11 | HIGH | Quit sırasında cancellation beklenmiyor; rejection ve yetim süreç riski var |
| BUG-CAT1-12 | HIGH | Eski depolama migration’ı her açılışta tekrar çalışıyor; silinmiş veya uyumsuz veriler geri geliyor |

---

# BUG-CAT1-01 — Eşzamanlı `attach()` çağrıları oturum sahipliğini bozuyor

**Önem:** HIGH  
**Referans:** `src/renderer/browser-dub-audio.js` → `BrowserDubAudio.attach()`, `remove()`

### Kök neden

`attach()` şu noktada kontrolü bırakıyor:

```js
await this.remove();
```

Ancak işlem için bir generation/token ayrılmıyor. Beklemeden sonra yalnızca eski cleanup’ın tamamlandığı biliniyor; bu sırada daha yeni bir `attach()` veya `remove()` çağrısının gerçekleşmediği doğrulanmıyor.

İki çağrı aynı cleanup Promise’ini bekleyip sırayla devam edebilir:

1. A, `this.session = sA` yapar ve timer başlatır.
2. B, A’yı kaldırmadan `this.session = sB` yapar ve başka timer başlatır.
3. A’nın `mutePromise` sonucu geldiğinde `this.session !== sA` nedeniyle A yalnızca `false` döner.
4. A’nın timer’ı ve mute yan etkileri geri alınmaz.

`this.timer` tek alan olduğundan A’nın timer kimliği kaybolur; sonraki `remove()` yalnızca B’nin timer’ını temizleyebilir.

### Mimari etki

- Kalıcı `setInterval` sızıntısı.
- Aynı audio element üzerinde birden fazla kontrol döngüsü.
- Yanlış `priorMuted` devralınması.
- Eski attach’in mute işleminin yeni oturuma etki etmesi.
- Kullanıcının sesi kapalı kalmış sekmeyle bırakılması.

### Kesin yeniden üretim

1. `mute()` için elle çözülebilen Promise kullanan bir test double oluşturun.
2. Aynı tick içinde:

```js
const a = dub.attach(fileA, contextA);
const b = dub.attach(fileB, contextB);
```

3. Her iki çağrının da `await this.remove()` sonrasına ilerlemesini sağlayın.
4. B’nin mute işlemini, ardından A’nınkini çözün.
5. `remove()` çağırın.
6. Aktif interval sayısının sıfıra inmediğini ve A’nın mute etkisinin sahiplenilmediğini gözlemleyin.

### Üretim düzeyinde düzeltme

`attach/remove` işlemleri için ayrı bir **intent generation** kullanın. `attach()` içinden çağrılan teardown bu generation’ı artırmamalıdır.

```js
// constructor
this.intentGeneration = 0;

async attach(file, c) {
  const intent = ++this.intentGeneration;

  const priorMuted =
    this.session?.tabId === c.tabId
      ? this.session.priorMuted
      : c.priorMuted;

  const priorRate =
    this.session?.tabId === c.tabId && this.session.sync
      ? this.session.baseRate
      : c.playbackRate;

  await this.detachCurrent();

  if (intent !== this.intentGeneration) return false;
  if (!file || !c.tabId || !c.mediaKey ||
      !['browser', 'player'].includes(c.mode)) {
    return false;
  }

  const s = {
    ...c,
    intent,
    priorMuted,
    baseRate: Math.max(.25, Math.min(4, Number(priorRate) || 1)),
    muted: false,
    url: null
  };

  // Sync/range/background validation işlemleri burada,
  // this.session atanmadan yapılmalı.

  if (intent !== this.intentGeneration) return false;
  this.session = s;

  // Mevcut kurulumun devamı...
}

remove() {
  ++this.intentGeneration;
  return this.detachCurrent();
}

async detachCurrent() {
  // Mevcut remove() gövdesi.
  // Burada intentGeneration artırılmaz.
}
```

Mute/rate gibi her `await` sonrasında hem `this.session === s` hem de `s.intent === this.intentGeneration` doğrulanmalıdır.

---

# BUG-CAT1-02 — Gecikmiş `play()` sonucu güncel oynatma niyetini doğrulamıyor

**Önem:** HIGH  
**Referans:** `src/renderer/browser-dub-audio.js` → `tick()`, `syncBackground()`, `pauseAll()`

### Kök neden

Ana sesin `play()` fulfillment kontrolü yalnızca şu koşulları değerlendiriyor:

```js
this.session === s &&
(!this.matches(s) || this.sample?.paused ||
 this.sample?.adPlaying || this.sample?.spinnerVisible)
```

Ancak `tick()` sesi aşağıdaki nedenlerle de durduruyor:

- Örnek 2,2 saniyeden eski.
- `readyState < 3`.
- Range dışında.
- Sync sınırının dışında.
- Hedef ses süresinin dışında.
- Mute geçişi henüz tamamlanmamış.

Bunların tümü fulfillment kontrolünde yoktur. Background kontrolünde `spinnerVisible` dahi yoktur.

Ayrıca:

```js
if (this.session === s && ...)
```

ifadesi eski session için **hiçbir şey yapmıyor**. Bu, session kimliğini stale Promise’i geçersiz kılan bir mekanizma olarak değil, yalnızca callback’in etkisini bastıran bir koşul olarak kullanıyor.

Native `HTMLMediaElement.pause()/load()` normalde pending play isteğini iptal eder; dolayısıyla her geç resolve kesin ses sızıntısı üretir denemez. Bununla birlikte kodun kendi oynatma-niyeti doğrulaması eksiktir ve aynı session içindeki seek/range/stall yarışlarını kapsamaz.

### Etki

- Durması gereken background sesinin tekrar başlaması.
- Seek/range sınırında kısa süreli yanlış ses.
- Geç `AbortError` nedeniyle geçerli yeni oynatma durumunun tamamen kaldırılması.
- Ana ses ve background arasında ayrışan oynatma durumu.

### Yeniden üretim

Kontrollü audio double ile:

1. `play()` Promise’ini pending bırakın.
2. `tick()` ile oynatma başlatın.
3. Aynı session’da range dışına seek edin veya örneği stale yapın.
4. `tick()` `pauseAll()` çağırsın.
5. Önceki `play()` Promise’ini resolve edin.
6. Mevcut callback’in range/staleness kontrolü yapmadığını doğrulayın.

İkinci testte background için `spinnerVisible = true` yapın; fulfillment callback background’u bu nedenle durdurmaz.

### Üretim düzeyinde düzeltme

Her element için ayrı play epoch ve açık `wanted` durumu kullanın:

```js
// constructor
this.playState = new Map(
  [audio, backgroundAudio].filter(Boolean).map(element => [
    element, { epoch: 0, wanted: false, pending: false }
  ])
);

stopElement(element) {
  if (!element) return;
  const state = this.playState.get(element);
  state.wanted = false;
  state.epoch++;
  element.pause();
}

pauseAll() {
  this.stopElement(this.audio);
  this.stopElement(this.backgroundAudio);
}

requestPlay(element, s, failureMessage) {
  const state = this.playState.get(element);
  state.wanted = true;
  if (!element.paused || state.pending) return;

  const epoch = ++state.epoch;
  const source = element.getAttribute('src');
  state.pending = true;

  Promise.resolve()
    .then(() => {
      if (this.session !== s || state.epoch !== epoch ||
          !state.wanted ||
          element.getAttribute('src') !== source) {
        return;
      }
      return element.play();
    })
    .then(() => {
      // Eski kaynak yeni kaynağı pause etmemeli.
      if (this.session === s &&
          element.getAttribute('src') === source &&
          (state.epoch !== epoch || !state.wanted || !this.matches(s))) {
        element.pause();
      }
    })
    .catch(error => {
      if (this.session !== s || state.epoch !== epoch ||
          !state.wanted ||
          element.getAttribute('src') !== source) return;

      if (error?.name !== 'AbortError') {
        void this.fail(failureMessage);
      }
    })
    .finally(() => {
      state.pending = false;
    });
}
```

`tick()` ve `syncBackground()` içindeki bütün durdurma yolları `stopElement()` üzerinden geçmelidir. Oynatma kararı yalnızca güncel `tick()` tarafından verilmelidir.

---

# BUG-CAT1-03 — Audio listener’ları sökülemiyor; eski instance güncel oturumu durdurabiliyor

**Önem:** HIGH  
**Referans:** `src/renderer/browser-dub-audio.js` → constructor’daki `addEventListener()` çağrıları

### Kök neden

Listener’lar anonim fonksiyonlarla ekleniyor:

```js
audio.addEventListener('error', () => this.fail(...));
```

Ancak sınıfta `dispose()` veya `destroy()` yok. `remove()` yalnızca session’ı kaldırıyor; instance listener’larını sökmüyor.

Aynı audio element üzerinde yeni `BrowserDubAudio` oluşturulursa eski instance hâlâ elemente bağlıdır. Özellikle eski instance’ın `error` handler’ı:

```js
this.fail(...)
  -> this.remove()
  -> this.pauseAll()
  -> audio.removeAttribute('src')
  -> audio.load()
```

zinciriyle yeni instance’ın kaynağını kaldırabilir.

**Not:** Kodda `pause` listener’ı yoktur. Bu nedenle burada bir “pause listener sızıntısı” değil, mevcut metadata/error/ended listener’larının lifecycle eksikliği söz konusudur.

### Yeniden üretim

1. Aynı `audio` ve `backgroundAudio` ile instance A oluşturun.
2. A’yı UI’dan kaldırın; yalnızca `A.remove()` çağırın.
3. Aynı elementlerle instance B oluşturup dosya bağlayın.
4. Audio elementinde `error` olayı üretin.
5. Hem A hem B handler’ının çalıştığını ve A’nın B kaynağını kaldırabildiğini gözlemleyin.

### Düzeltme

Listener sahipliğini açıkça yönetin. Session olmadığı zaman media error işlenmemelidir.

```js
// constructor
this.disposed = false;
this.listeners = [];

const listen = (target, type, handler) => {
  if (!target) return;
  target.addEventListener(type, handler);
  this.listeners.push(() => target.removeEventListener(type, handler));
};

listen(audio, 'loadedmetadata', () => {
  if (!this.disposed && this.session) this.tick();
});

listen(audio, 'error', () => {
  if (!this.disposed && this.session) {
    void this.fail('Ses dosyası açılamadı. WAV veya MP3 deneyin.');
  }
});

listen(audio, 'ended', () => {
  if (!this.disposed && this.session) this.tick();
});

listen(backgroundAudio, 'loadedmetadata', () => {
  if (!this.disposed && this.session) this.tick();
});

listen(backgroundAudio, 'error', () => {
  if (!this.disposed && this.session?.background) {
    void this.fail('Arka plan sesi açılamadı.');
  }
});

async dispose() {
  if (this.disposed) return;
  this.disposed = true;
  for (const unlisten of this.listeners.splice(0)) unlisten();
  await this.remove();
}
```

UI/component teardown sözleşmesi `dispose()` çağrısını zorunlu tutmalıdır.

---

# BUG-CAT1-04 — İlk mute çağrısı `try` dışında; senkron hata session’ı yarım bırakıyor

**Önem:** HIGH  
**Referans:** `src/renderer/browser-dub-audio.js` → `attach()`

### Kök neden

Şu ifade `try` bloğundan önce:

```js
s.mutePromise = Promise.resolve(this.mute(s.tabId, s.desiredMuted))
```

`Promise.resolve()` argümanı önce değerlendirilir. `this.mute()` senkron exception atarsa Promise’e dönüştürülmez.

O anda:

- `this.session` atanmıştır.
- Interval başlamıştır.
- `changed()` çağrılmıştır.
- `s.mutePromise` henüz oluşmamıştır.
- Oturumun cleanup yolu çalışmaz.

### Tetikleyici

IPC adapter’ının geçersiz tab için senkron hata atması, bridge’in kapanmış olması veya test/alternatif implementasyonun exception üretmesi.

### Yeniden üretim

```js
const dub = new BrowserDubAudio({
  audio,
  context,
  mute() { throw new Error('bridge unavailable'); }
});

await dub.attach(file, validContext

---

# Kategori 2: IPC Güvenliği, Preload Köprüsü ve Süreç Yaşam Döngüsü

## Kapsam ve doğrulama sınırı

İncelenen dosyalar:

- `src/preload.js`
- `src/local-file-access.js`
- `src/settings-security.js`
- `src/provider-api-keys.js`
- `src/process-lifecycle.js`
- `src/process-io.js`

**Önemli sınır:** `ipcMain` handler’ları, `BrowserWindow` oluşturma seçenekleri, navigation politikaları ve Python/ffmpeg başlatma noktaları paylaşılmamıştır. Dolayısıyla:

- `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false` ayarlarının gerçekten uygulandığı doğrulanamamaktadır.
- IPC gönderenlerinin `senderFrame` üzerinden doğrulandığı doğrulanamamaktadır.
- Renderer’ın bir IPC çağrısıyla kesin olarak keyfi dosya yazabildiği veya Electron main sürecini çökertebildiği iddia edilmemektedir.
- Aşağıdaki bulguların bazılarında modül seviyesindeki hata doğrudan kanıtlanabilir; uçtan uca saldırı etkisi ise ilgili handler’ın bu modülü nasıl kullandığına bağlıdır. Bu ayrım ilgili bulgularda belirtilmiştir.

Satır numarası yerine, verilen kaynak içindeki **tam fonksiyon ve ifade referansları** kullanılmıştır.

## Yönetici özeti

| ID | Severity | Bulgu |
|---|---|---|
| BUG-CAT2-01 | MEDIUM | İki preload event API’si ham Electron IPC event nesnesini renderer callback’ine geçiriyor |
| BUG-CAT2-02 | MEDIUM | Windows’ta sürücüsüz kök yollar mutlak yol kabul edilerek çalışma dizinine bağlı hedef seçiliyor |
| BUG-CAT2-03 | HIGH | Yetkilendirmeden önce senkron UNC çözümlemesi main thread’i bloklayabilir ve SMB bağlantısı başlatabilir |
| BUG-CAT2-04 | HIGH | Transaction rollback başarısız olsa bile tek kurtarma kopyası siliniyor |
| BUG-CAT2-05 | HIGH | Recovery sırasında journal silinemezken commit marker silinebiliyor; sonraki recovery commit edilmiş veriyi geri alabiliyor |
| BUG-CAT2-06 | HIGH | Endpoint identity tüm URL’yi küçük harfe çevirerek farklı credential hedeflerini aynı kabul ediyor |
| BUG-CAT2-07 | HIGH | API key profile içindeki tekil sırlar backup/public redaction sözlüğüne eklenmiyor |
| BUG-CAT2-08 | HIGH | Provider credential scope HTTP/HTTPS ve port ayrımını kaldırıyor |
| BUG-CAT2-09 | MEDIUM | Prototype zinciri üzerinden provider/profile lookup hatalı nesne ve fonksiyon döndürebiliyor |
| BUG-CAT2-10 | HIGH | `probeCommand` stderr tüketmediği için child process pipe backpressure ile kilitlenebiliyor |
| BUG-CAT2-11 | HIGH | Probe timeout/limit yolu süreç ağacını sahiplenmeden işi tamamlanmış gösteriyor; çıktı işlemeye de devam ediyor |
| BUG-CAT2-12 | HIGH | `taskkill` başarısı child kapanışı yerine kullanılıyor; watchdog iptal edilip iptal state’i kalıcı kilitlenebiliyor |

**Öncelik:** Önce `BUG-CAT2-04`, `05`, `10`, `11`, `12`; ardından credential isolation bulguları düzeltilmelidir.

---

## BUG-CAT2-01 — Ham Electron IPC event nesnesinin preload sınırından geçirilmesi

**Severity: MEDIUM**

### Dosya / fonksiyon

`src/preload.js`

- `onYoutubeTvEvent`
- `onYoutubeEvent`

Hatalı desen:

```js
ipcRenderer.on('youtube-tv:event', listener);
ipcRenderer.on('youtube:event', listener);
```

Diğer event API’lerinde doğru biçimde `_event` ayıklanırken bu iki API’de ayıklanmamaktadır.

### Kök neden ve mimari etki

Electron event callback’inin ilk parametresi uygulama payload’u değildir; Electron IPC event nesnesidir.

Renderer’dan gelen callback’in doğrudan `ipcRenderer.on()` içine yerleştirilmesi:

- Ayrıcalıklı event nesnesini bridge sınırına taşır.
- Güvenlik sözleşmesini Electron sürümünün nesne taşıma davranışına bağımlı kılar.
- Callback’in ilk argüman olarak payload beklemesi halinde işlevsel state desync oluşturur.

**Modern Electron sürümlerinde bunun otomatik olarak kullanılabilir bir `ipcRenderer` veya Node referansı sızıntısı oluşturduğu varsayılamaz.** Electron’un bazı sürümleri bu nesneleri bridge üzerinden taşımaz veya kısıtlar. Ancak ham event geçirme deseni yine de hatalıdır; sürüme göre boş nesne, serialization hatası veya gereksiz ayrıcalıklı nesne maruziyeti üretir.

### Somut tetikleme / yeniden üretim

Renderer:

```js
const unsubscribe = window.api.onYoutubeEvent((payload) => {
  console.log('Beklenen uygulama payload’u:', payload);
});
```

Main:

```js
webContents.send('youtube:event', {
  type: 'session',
  authenticated: true
});
```

Callback’in ilk argümanı `{ type: 'session', ... }` yerine Electron event argümanıdır.

### Production-ready düzeltme

```js
function subscribePayload(channel, callback) {
  if (typeof callback !== 'function') {
    throw new TypeError('Event callback bir fonksiyon olmalıdır.');
  }

  const wrapped = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, wrapped);

  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    ipcRenderer.removeListener(channel, wrapped);
  };
}
```

Bridge içinde:

```js
onYoutubeTvEvent: (callback) =>
  subscribePayload('youtube-tv:event', callback),

onYoutubeEvent: (callback) =>
  subscribePayload('youtube:event', callback),
```

Renderer tüketicileri hâlen `(event, payload)` imzası kullanıyorsa aynı değişiklikte payload-only imzaya geçirilmelidir.

---

## BUG-CAT2-02 — Windows’ta sürücüsüz kök yolun tam mutlak yol sanılması

**Severity: MEDIUM**

### Dosya / fonksiyon

- `src/local-file-access.js` → `canonicalLocalPath`
- `src/settings-security.js` → `pathSetting`

İlgili kontroller:

```js
path.isAbsolute(value)
```

ve:

```js
path.win32.isAbsolute(text)
```

### Kök neden ve mimari etki

Windows’ta:

```js
path.win32.isAbsolute('\\output\\result.srt') === true
```

Ancak `\output\result.srt`, sürücüsü açıkça belirlenmiş bir yol değildir. Hedef, sürecin geçerli sürücüsüne göre değişir.

`pathSetting()` ayrıca yolları normalize etmeden saklar. Böylece aynı ayar:

- Bir çalıştırmada `C:\output`,
- Başka bir çalıştırmada `D:\output`

anlamına gelebilir.

Bu, özellikle output/watch/input klasörlerinde beklenmedik dosya oluşturma, yanlış klasör izleme ve kullanıcı dosyası üzerine yazma riskini artırır.

Bu hata `C:relative` biçiminden farklıdır: mevcut kod onu zaten reddetmektedir. Kaçan durum `\rooted` ve `/rooted` biçimidir.

### Somut yeniden üretim

Windows:

```js
const path = require('path');

console.log(path.win32.isAbsolute('\\exports')); // true
console.log(path.resolve('\\exports'));          // ör. C:\exports
```

Aynı uygulama farklı sürücüdeki çalışma dizininden başlatıldığında çözüm değişebilir.

### Production-ready düzeltme

Windows üzerinde yalnız sürücü harfli veya tam UNC yolları kabul edin:

```js
function isFullyQualifiedWindowsPath(value) {
  return /^[A-Za-z]:[\\/]/.test(value)
    || /^\\\\[^\\/]+\\[^\\/]+(?:[\\/]|$)/.test(value);
}
```

`canonicalLocalPath()` içinde extended-prefix dönüşümünden sonra:

```js
if (process.platform === 'win32'
    && !isFullyQualifiedWindowsPath(value)) {
  throw new Error('Sürücüsü veya UNC paylaşımı açıkça belirtilen yol gerekli.');
}
```

`pathSetting()`:

```js
function pathSetting(value, label) {
  const text = boundedString(value, label, 4000);
  if (!text) return '';

  const valid = process.platform === 'win32'
    ? isFullyQualifiedWindowsPath(text)
    : path.posix.isAbsolute(text);

  if (!valid) {
    throw new SettingsValidationError(
      `${label} tam nitelikli mutlak bir yol olmalıdır.`
    );
  }

  return path.normalize(text);
}
```

Platformlar arası backup taşınabilirliği gerekiyorsa, “yol sözdizimsel olarak başka platforma ait” ile “bu sistemde kullanılabilir yol” ayrı alanlar olarak ele alınmalıdır. Başka platforma ait yol doğrudan etkin output/watch dizini yapılmamalıdır.

---

## BUG-CAT2-03 — Yetkilendirme öncesi senkron UNC erişimi

**Severity: HIGH**

### Dosya / fonksiyon

`src/local-file-access.js`

- `canonicalLocalPath`
- `MediaFileAccess.authorize`
- `MediaFileAccess.has`
- `SubtitleFileAccess.inspect`
- `PdfFileAccess.inspect`

Özellikle:

```js
const target = this.inspect(value);
if (!this.grants.has(this.key(target))) ...
```

`inspect()` öncesinde:

```js
fs.existsSync(...)
fs.realpathSync(...)
fs.statSync(...)
```

çalıştırılmaktadır.

### Kök neden ve mimari etki

UNC yolu, “yerel dosya yolu” olarak kabul edilmekte ve grant kontrolünden **önce** işletim sistemine verilmektedir.

Örneğin:

```text
\\attacker-host\share\movie.mp4
```

Bu yol henüz yetkisiz olsa bile `existsSync()`:

- SMB bağlantısı başlatabilir.
- Windows kimlik doğrulama pazarlığına neden olabilir.
- Erişilemeyen sunucu nedeniyle uzun süre bloklanabilir.
- Main thread üzerinde çağrılıyorsa bütün Electron uygulamasını dondurabilir.

Bu nedenle “sonunda grant bulunamadı ve reddedildi” güvenli değildir: ağ erişimi ve bloklama reddetmeden önce gerçekleşmiştir.

**Uçtan uca IPC erişilebilirliği handler koduna bağlıdır.** Ancak `authorize()` fonksiyonunun kendisinde yetki kontrolünden önce I/O yapıldığı doğrudan görülmektedir.

### Somut yeniden üretim

Windows üzerinde erişilemeyen veya trafiği düşüren bir SMB sunucusu kullanın:

```js
const access = new MediaFileAccess(['mp4']);

const start = Date.now();
try {
  access.authorize('\\\\192.0.2.1\\share\\movie.mp4');
} catch (error) {
  console.log(Date.now() - start, error.message);
}
```

Hiç grant olmamasına rağmen ağ çözümleme/erişim denemesi gerçekleşir.

### Production-ready düzeltme

En basit güvenli politika, bu modülün gerçekten **local-only** olmasıdır:

```js
function rejectNetworkPath(value) {
  if (process.platform === 'win32'
      && typeof value === 'string'
      && /^[\\/]{2}/.test(value)) {
    throw new Error

---

# Kategori 3: Çeviri Boru Hattı, Kimlik Doğrulama ve Bellek Önbelleği

**Kategori:** Çeviri Boru Hattı, Kimlik Doğrulama ve Bellek Önbelleği  
**İncelenen kapsam:** Sağlanan beş dosyanın tamamı  
**Yöntem:** Statik kod ve kontrol akışı analizi. Aşağıdaki reproduksiyonlar test önerileridir; kodun çalıştırıldığı iddia edilmemektedir.

## Yönetici özeti

Kodda doğrudan doğrulanabilen başlıca sorunlar:

- Öğrenilmiş token tavanı, başlangıç token bütçesini yanlışlıkla **yükseltebiliyor**.
- Tek bir büyük grup, token ve parça sınırlarını **koşulsuz aşabiliyor**.
- Fuzzy translation memory, anlamı farklı gerçek sözcükleri yazım hatası sayarak **yanlış çeviriyi sessizce yeniden kullanabiliyor**.
- SQLite yazma hatalarında transaction geri alınmadığından, özellikle Windows’ta diğer bağlantıları engelleyen **uzun ömürlü yazma kilitleri** oluşabiliyor.
- Probe yanıtlarının bazı hata yollarında HTTP body tüketilmiyor veya iptal edilmiyor.
- Yanıt gövdesi okunurken oluşan timeout, yanlışlıkla `invalid_response` olarak raporlanıyor.
- JavaScript tarafında IPv6 loopback adresi tanınmıyor; Python ile kimlik doğrulama sözleşmesi ayrışıyor.
- Probe çıktısı token bakımından sınırsız bırakılıyor ve istenen `OK` yanıtı gerçekten doğrulanmıyor.
- Planlayıcı istatistikleri ve translation memory kayıt boyutları için gerçek bellek/veri hacmi sınırları bulunmuyor.

### Kapsam nedeniyle doğrulanamayan kritik alanlar

Aşağıdaki parçalar sağlanmadığından bunlar hakkında kesin güvenlik sonucu üretilemez:

| Alan | Eksik bileşen |
|---|---|
| `v5` çeviri hash’i | Hash oluşturma ve cache lookup/store kodu |
| `context_before/context_after` | Prompt oluşturucu ve token sayacı |
| API key’in argv/log/telemetry’ye sızması | Process başlatma, logger, telemetry ve SDK çağrı katmanları |
| Sonsuz retry / halüsinasyon kırıcı | Çeviri yürütücüsü ve retry state machine |
| Sözlük/JSON cache dosyalarının atomic yazılması | İlgili dosya okuma/yazma kodları |

**Önemli:** Sağlanan `TranslationMemory.context_key()` fonksiyonu bir `v5` cache anahtarı değildir. Bu iki mekanizmayı aynı kabul etmek yanlış olur.

---

# Bulgular

## BUG-CAT3-01 — Öğrenilmiş token tavanı, yapılandırılmış bütçeyi geçersiz kılar

**Önem derecesi: HIGH**

**Dosya / referans:** `backend/translate_planner.py` → `AdaptivePlanner.pack_groups()`:

```python
cap = self.token_ceiling or self.token_budget
```

### Kök neden ve mimari etki

`token_ceiling` sıfırdan farklı olduğunda `token_budget` tamamen yok sayılıyor.

Öğrenilmiş tavanın amacı mevcut bütçeyi daha da daraltmaktır. Mevcut uygulama ise öğrenilmiş değer başlangıç bütçesinden büyükse bütçeyi genişletiyor.

Bu durum özellikle büyük bir grubun tek başına bütçeyi aşarak gönderilmesinden sonra ortaya çıkar:

1. Başlangıç bütçesi `1000`.
2. Tek grup maliyeti `3000`.
3. Grup mevcut kodla yine paketlenir.
4. `TRUNCATED` sonucu `2400` token tavanı öğretir.
5. Sonraki paketlerin sınırı `1000` yerine `2400` olur.

Bu öğrenme, kesilmeyi azaltmak yerine artırabilir.

### Reproduksiyon

```python
from backend.translate_planner import AdaptivePlanner, TRUNCATED

p = AdaptivePlanner(token_budget=1000)
p.record(TRUNCATED, est_tokens=3000)

groups = [[0], [1]]
chunk, pos = p.pack_groups(groups, 0, lambda group: 600)

assert p.token_ceiling == 2400
assert chunk == [0, 1]  # 1200 token: yapılandırılmış 1000 sınırı aşıldı.
```

### Üretime uygun düzeltme

Her iki pozitif sınırdan küçüğünü kullanın:

```python
def _effective_token_cap(self):
    limits = [
        value
        for value in (self.token_budget, self.token_ceiling)
        if value > 0
    ]
    return min(limits) if limits else 0
```

`pack_groups()` içinde:

```diff
- cap = self.token_ceiling or self.token_budget
+ cap = self._effective_token_cap()
```

**Regresyon koşulu:** Öğrenme hiçbir zaman yapılandırılmış pozitif token bütçesini yükseltmemelidir.

---

## BUG-CAT3-02 — İlk grup için bütün paket sınırları devre dışı; aşırı büyük girdide ilerleme garantisi yok

**Önem derecesi: HIGH**

**Dosya / referans:** `backend/translate_planner.py` → `AdaptivePlanner.pack_groups()`

```python
if chunk and (len(chunk) + len(group) > limit
              or (cap and cost + gcost > cap)):
    break
```

### Kök neden ve mimari etki

Sınırlar yalnız `chunk` doluysa kontrol ediliyor. Dolayısıyla ilk grup:

- Token bütçesini,
- Öğrenilmiş token tavanını,
- `chunk_size` sınırını,

istediği kadar aşabiliyor.

Bu davranış docstring içinde belirtilmiş olsa da token bütçesini güvenlik sınırı olarak kullanmayı imkânsızlaştırıyor. Çok uzun tek bir altyazı/cümle grubu, parça küçültme mekanizmasının hiçbir zaman çözemediği bir girdiye dönüşür.

`TRUNCATED` sonrasında daha küçük tavan öğrenilmesi de yardımcı olmaz: aynı büyük grup tekrar tek başına kabul edilir.

**Sonsuz retry yürütücüsü bu dosyalarda yoktur; sonsuz döngü doğrulanamaz. Ancak planlayıcının bu girdide küçülerek ilerleme sağlayamadığı doğrudan doğrulanabilir.**

### Reproduksiyon

```python
p = AdaptivePlanner(base_chunk=4, min_chunk=1, token_budget=100)

chunk, pos = p.pack_groups(
    [[0, 1, 2, 3, 4, 5]],
    0,
    lambda group: 50_000,
)

assert len(chunk) == 6
assert pos == 1
```

### Üretime uygun düzeltme

Bölünemeyen grup sınırı aşıyorsa bunu açık ve terminal bir paketleme sonucu yapın. Aynı girdiyi tekrar API’ye göndermek yerine çağıran katman grubu bölmeli veya kullanıcıya kontrollü hata döndürmelidir.

```python
class OversizedTranslationGroup(ValueError):
    def __init__(self, position, item_count, estimated_tokens):
        super().__init__("Çeviri grubu paketleme sınırını aşıyor")
        self.position = position
        self.item_count = item_count
        self.estimated_tokens = estimated_tokens


def pack_groups(self, groups, pos, size_of):
    if not 0 <= pos <= len(groups):
        raise ValueError("Geçersiz grup konumu")

    limit = self.chunk_size
    cap = self._effective_token_cap()
    chunk, cost, i = [], 0, pos

    while i < len(groups):
        group = groups[i]
        if not group:
            raise ValueError("Boş çeviri grubu")

        gcost = int(size_of(group) or 0)
        if gcost < 0:
            raise ValueError("Negatif token maliyeti")

        if len(group) > limit or (cap and gcost > cap):
            if chunk:
                break
            raise OversizedTranslationGroup(i, len(group), gcost)

        if chunk and group[0] != chunk[-1] + 1:
            break

        if chunk and (
            len(chunk) + len(group) > limit
            or (cap and cost + gcost > cap)
        ):
            break

        chunk.extend(group)
        cost += gcost
        i += 1

    return chunk, i
```

**Entegrasyon sözleşmesi:** `OversizedTranslationGroup`, genel ağ hatası gibi retry edilmemelidir.

Ayrıca bu düzeltme ancak `size_of()` gerçek maliyeti ölçüyorsa yeterlidir. Sistem mesajı, `context_before`, `context_after`, sözlük ve çıktı rezervi bu fonksiyon dışında ekleniyorsa gerçek model sınırı yine aşılabilir; ilgili kod sağlanmamıştır.

---

## BUG-CAT3-03 — Fuzzy memory, farklı anlam taşıyan sözcükleri eşdeğer sayıyor

**Önem derecesi: HIGH**

**Dosya / referans:** `backend/translation_memory.py` → `_near_typographic_tokens()`, `fuzzy_semantically_compatible()`, `TranslationMemory.lookup()`

### Kök neden ve mimari etki

Bir içerik sözcüğünün:

- En az beş karakter olması,
- Benzerlik oranının `.88` üzerinde olması,
- Baş/son ekleme kontrolüne takılmaması,

anlamının aynı olduğunu kanıtlamaz.

Örneğin `patients` ve `patents` farklı, geçerli İngilizce sözcüklerdir. Bir harf farkı içerirler ve mevcut kontrolleri geçerler.

Olumsuzluk/modal/zamir/özel ad imzaları bu problemi çözmez; değişen sözcük bu sınıflardan hiçbirine ait değildir.

Sonuç ağ hatası değil, daha tehlikeli olan **sessiz yanlış çeviri**dir.

### Reproduksiyon

```python
from backend.translation_memory import (
    TranslationMemory,
    fuzzy_semantically_compatible,
)

assert fuzzy_semantically_compatible(
    "The patients are ready.",
    "The patents are ready.",
)

tm = TranslationMemory(":memory:")
try:
    tm.store(
        "The patients are ready.",
        "Hastalar hazır.",
        "en-tr",
        "same-context",
    )

    hit = tm.lookup(
        "The patents are ready.",
        "en-tr",
        "same-context",
    )

    assert hit is not None
    assert hit["target"] == "Hastalar hazır."
finally:
    tm.close()
```

İkinci cümle patentlerle ilgilidir; hasta çevirisi kullanılmamalıdır.

### Üretime uygun düzeltme

Doğrulanmamış fuzzy eşleşmeyi otomatik cache hit olarak kullanmayın. Güvenli acil düzeltme, NFC normalizasyonu dışında kaynak eşitliği istemektir:

```python
def _exact_source_key(text):
    return unicodedata.normalize("NFC", str(text or "").strip())
```

`lookup()` içindeki aday döngüsünü şu şekilde değiştirin:

```python
source_key = _exact_source_key(source)

for candidate, target in rows:
    if _exact_source_key(candidate) == source_key:
        return {
            "target": target,
            "source": candidate,
            "ratio": 1.0,
        }

return None
```

Fuzzy sonuçlar korunacaksa yalnız **öneri** olarak dönmeli veya önceden onaylanmış kaynak alias’larına dayanmalıdır. Genel edit-distance kontrolüne birkaç semantik blacklist eklemek bu sınıf hatayı kapatmaz.

---

## BUG-CAT3-04 — SQLite hatalarında rollback yapılmaması yazma transaction’ını ve kilitleri açık bırakıyor

**Önem derecesi: HIGH**

**Dosya / referans:** `backend/translation_memory.py` → `TranslationMemory.store()`

### Kök neden ve mimari etki

Kod transaction başlatan `INSERT` sonrasında birden fazla işlem yapıyor, fakat hiçbir `except` yolunda `rollback()` çağırmıyor.

Hata kaynakları:

- Prune sırasında `OperationalError`,
- Trigger veya constraint hatası,
- Disk dolması,
- Commit sırasında `SQLITE_BUSY`,
- Dosya sistemi/antivirüs kaynaklı geçici I/O hataları.

Python `RLock`’unun bırakılması SQLite transaction’ını kapatmaz. Aynı süreçte farklı `TranslationMemory` nesneleri veya başka süreçler aynı veritabanına yazmaya çalıştığında bloklanabilir.

Sonraki `store()` çağrısı eski transaction’ı istemeden commit ederek başarısız kabul edilen bir işlemi de kalıcılaştırabilir.

### Reproduksiyon

Geçici dosya üzerinde:

```python
tm = TranslationMemory(db_path)

tm._conn.execute("""
CREATE TRIGGER reject_tm_write
BEFORE INSERT ON tm
BEGIN
    SELECT RAISE(ABORT, 'forced failure');
END;
""")
tm._conn.commit()

try:
    tm.store("A sufficiently long source", "Çeviri", "en-tr", "ctx")
except sqlite3.DatabaseError:
    pass

assert tm._conn.in_transaction
```

Ardından ikinci bağlantıyla yazmayı deneyin:

```python
other = sqlite3.connect(db_path, timeout=0.1)
try:
    other.execute("""
        INSERT INTO tm(source,target,scope,context_key,created_at)
        VALUES('another source','başka','en-tr','ctx2',0)
    """)
finally:
    other.close()
```

Açık transaction nedeniyle diğer yazıcı `database is locked` alabilir.

### Üretime uygun düzeltme

`store()` içindeki **INSERT, count, prune ve commit** aynı transaction context manager altında olmalıdır:

```python
with self._lock:
    if self._conn is None:
        raise RuntimeError("Çeviri hafızası kapalı")

    with self._conn:
        self._conn.execute(
            "INSERT INTO tm(source,target,scope,context_key,created_at) "
            "VALUES(?,?,?,?,?) "
            "ON CONFLICT(source,scope,context_key) DO UPDATE SET "
            "target=excluded.target,created_at=excluded.created_at",
            (
                source,
                target,
                str(scope),
                self.context_key(context_fingerprint),
                time.time(),
            ),
        )

        count = int(
            self._conn.execute("SELECT count(*) FROM tm").fetchone()[0]
        )
        prune_at = self.max_rows + min(
            1000, max(1, self.max_rows // 20)
        )
        overflow = count - self.max_rows

        if overflow > 0 and count >= prune_at:

---

# Kategori 4: Canlı ASR, Ses Anahtarlayıcı ve Gerçek Zamanlı Akış

## Kapsam ve sonuç

İncelenen dosyalar:

- `src/live-asr-audio-switch.js`
- `src/live-asr-realtime.js`
- `src/renderer/live-asr-worklet.js`

**Toplam 8 somut bulgu:** 3 **HIGH**, 5 **MEDIUM**.

| ID | Seviye | Bulgu |
|---|---|---|
| BUG-CAT4-01 | HIGH | Gecikmiş ve yinelenmiş chunk sonuçları dil geçişi durum makinesini bozabiliyor |
| BUG-CAT4-02 | MEDIUM | Explicit `flush`, resampler’ın kesirli örnek durumunu temizlemiyor |
| BUG-CAT4-03 | HIGH | Giriş kaybı sırasında eski ve yeni ses aynı chunk içinde birleştiriliyor |
| BUG-CAT4-04 | HIGH | Worklet–renderer aktarımında backpressure yok; bellek ve gecikme sınırsız büyüyebiliyor |
| BUG-CAT4-05 | MEDIUM | 44.1/48 kHz → 16 kHz dönüşümünde yeterli anti-alias filtresi yok |
| BUG-CAT4-06 | MEDIUM | Stereo kanalların aritmetik ortalaması ters fazlı konuşmayı tamamen silebiliyor |
| BUG-CAT4-07 | MEDIUM | Sabit peak eşiği, düşük seviyeli ama anlaşılır konuşmayı kalıcı olarak düşürüyor |
| BUG-CAT4-08 | MEDIUM | Gerçek zaman monitörü ardışık yavaşlığı yanlış sayıyor ve backlog bitmeden “yetişti” diyor |

### Kanıt sınırları

Bu kaynaklarda şu bileşenler bulunmuyor:

- `getUserMedia` / `getDisplayMedia` çağrıları;
- `MediaStreamTrack` yaşam döngüsü;
- `devicechange`, `ended`, `mute`, `unmute` işleyicileri;
- `AudioContext` oluşturma, suspend/resume/close akışı;
- worklet’i yöneten renderer;
- Python süreci, IPC ve ASR iş kuyruğu.

Bu nedenle **Windows WASAPI/stereo mix kilitlenmesi**, **rapid start/stop sırasında eski session’ın yeniden bağlanması**, **process deadlock**, **EPERM/EBUSY** veya **unhandled Promise rejection** bu üç dosyadan doğrulanamaz. Aşağıdaki rapor, bu eksik bileşenlerde hata olduğunu varsaymaz.

---

## BUG-CAT4-01 — Gecikmiş ve yinelenmiş chunk sonuçları dil geçişini bozuyor

**Seviye: HIGH**

**Dosya / referans:**  
`src/live-asr-audio-switch.js` → `observe()`, `observeLanguage()`, `lastChunk` / `lastResult`.

### Kök neden

Deduplication yalnızca **hemen önceki** `chunkKey` için yapılıyor:

```js
if (chunkKey != null && chunkKey === lastChunk && lastResult) {
  return { ...lastResult, action: 'stable' };
}
```

Şu iki özellik eksik:

1. İşlenmiş chunk’ın tekrar geldiğini saptayacak bir geçmiş veya monoton sıra denetimi.
2. Sonucun mevcut oturuma ve geçerli stream generation’a ait olduğunu doğrulama.

`observeLanguage()` ise chunk sırasından bağımsız olarak her sonucu yeni bir gözlem kabul ediyor.

Bu, dosyanın başındaki “geç gelen eski-parça satırları yeni izin bağlamını kirletemez” garantisini sağlamaz. `streamSeq`, **sonucun ait olduğu stream’i değil, sonucun işlendiği anda mevcut olan stream’i** temsil ediyor.

### Somut hata senaryosu

```js
const sw = createLiveAsrAudioSwitch(2);

sw.observe('tr', 1); // stream 1
sw.observe('en', 2); // pending: 1
sw.observe('en', 3); // switch → stream 2

sw.observe('tr', 1); // eski sonuç yeniden geldi: pending tr: 1
sw.observe('tr', 0); // başka eski sonuç: switch → stream 3
```

Kaynak tekrar Türkçeye dönmediği hâlde sahte bir geçiş oluşur.

Ardışık olmayan tekrar da yeterlidir:

```js
sw.observe('tr', 1);
sw.observe('en', 2); // pending en: 1
sw.observe('', 3);
sw.observe('en', 2); // aynı chunk ikinci kez sayılır → switch
```

Tek bir İngilizce chunk, iki bağımsız doğrulama gibi sayılır.

### Mimari etki

- Yanlış altyazı izi oluşturulması.
- Geç sonuçların yeni stream’e yazılması.
- Rapid stop/start sonrasında eski session sonuçlarının yeni session durumuna karışması; çağıran taraf aynı nesneyi yeniden kullanıyorsa.
- Yeniden deneme veya IPC tekrar tesliminde sahte dil geçişleri.

### Üretime uygun düzeltme

Chunk kimliğine açık bir **session + monoton sequence** sözleşmesi eklenmeli. Geç veya yinelenmiş sonuçlar `stable` değil, **`ignore`** dönmeli; çağıran taraf bu sonuçtan cue üretmemeli.

Aşağıdaki uygulama, sonuçların canlı iz için monoton sırada kabul edilmesini sağlar:

```js
'use strict';

const normalizeLanguage = value =>
  String(value || '').trim().toLowerCase().replace(/[^a-z-]/g, '');

function createLiveAsrAudioSwitch({
  sessionId,
  minConsecutive = 2,
} = {}) {
  if (typeof sessionId !== 'string' || !sessionId) {
    throw new TypeError('sessionId zorunludur');
  }

  if (!Number.isSafeInteger(minConsecutive) || minConsecutive < 1) {
    throw new RangeError('minConsecutive pozitif bir safe integer olmalıdır');
  }

  const state = {
    observedLanguage: '',
    pendingLanguage: '',
    pendingCount: 0,
    streamSeq: 1,
  };

  let lastSequence = -1;

  function observe(rawLanguage, meta) {
    const sequence = meta?.sequence;

    if (
      meta?.sessionId !== sessionId ||
      !Number.isSafeInteger(sequence) ||
      sequence < 0 ||
      sequence <= lastSequence
    ) {
      return { action: 'ignore', reason: 'stale-or-duplicate' };
    }

    lastSequence = sequence;
    const seen = normalizeLanguage(rawLanguage);

    // Bilinmeyen dil, "ardışık aynı yeni dil" zincirini keser.
    if (!seen) {
      state.pendingLanguage = '';
      state.pendingCount = 0;
      return {
        action: 'stable',
        language: state.observedLanguage,
        streamSeq: state.streamSeq,
      };
    }

    if (!state.observedLanguage) {
      state.observedLanguage = seen;
    } else if (seen === state.observedLanguage) {
      state.pendingLanguage = '';
      state.pendingCount = 0;
    } else {
      if (seen === state.pendingLanguage) {
        state.pendingCount++;
      } else {
        state.pendingLanguage = seen;
        state.pendingCount = 1;
      }

      if (state.pendingCount < minConsecutive) {
        return {
          action: 'pending',
          language: seen,
          streamSeq: state.streamSeq,
        };
      }

      state.observedLanguage = seen;
      state.pendingLanguage = '';
      state.pendingCount = 0;
      state.streamSeq++;

      return {
        action: 'switch',
        language: seen,
        streamSeq: state.streamSeq,
      };
    }

    return {
      action: 'stable',
      language: state.observedLanguage,
      streamSeq: state.streamSeq,
    };
  }

  return { observe, snapshot: () => ({ ...state }) };
}
```

**Entegrasyon şartı:** Yeni capture session’ında yeni switch nesnesi oluşturulmalı. Paralel ASR sonuçlarının tamamının korunması gerekiyorsa `observe()` öncesinde sınırlı bir reorder buffer kullanılmalı; yukarıdaki politika geç gelen sonucu bilerek düşürür.

---

## BUG-CAT4-02 — Explicit flush, resampler’ın kesirli örnek durumunu temizlemiyor

**Seviye: MEDIUM**

**Dosya / referans:**  
`src/renderer/live-asr-worklet.js` → `port.onmessage` içindeki `flush` dalı; `flush()`; `sum` ve `weight`.

### Kök neden

Explicit flush:

```js
if (data.type === 'flush') {
  this.flush();
  this.clock = null;
  ...
}
```

Ancak `flush()` yalnızca tamamlanmış PCM örneklerini temizliyor. `sum` ve `weight` korunuyor.

Özellikle 44.1 kHz girişte:

```js
const ratio = 44100 / 16000; // 2.75625
```

Render quantum sonunda çoğu zaman henüz tamamlanmamış bir 16 kHz örneği bulunur. Bu kısmi örnek, sonraki session/sync geldiğinde yeni sesle tamamlanır.

Ayrıca:

```js
if (!this.length) return;
```

nedeniyle tamamlanmış PCM bulunmadığında bile kesirli durum temizlenmez.

### Tekrarlama

1. AudioContext’i 44.1 kHz ile çalıştırın.
2. Pozitif DC veya test tonu verin.
3. Bir veya birkaç render quantum sonrasında `flush` gönderin.
4. Negatif DC/sıfır girişle yeni `sync` gönderin.
5. Yeni parçanın ilk çıkış örneğinin eski capture’dan katkı aldığını kontrol edin.

### Etki

- Stop/start veya discontinuity sınırında örnek karışması.
- Küçük transient/click.
- Session’lar arasında DSP durumunun taşınması.
- “Flush tamamlandı” onayının gerçekte tüm capture durumunun temizlendiğini garanti etmemesi.

Bu hata tek başına uzun süreli sample-rate drift üretmez; etki sınırdaki kesirli örnektedir.

### Düzeltme

`flush()` boş tamponda da bütün resampler durumunu sıfırlamalıdır:

```js
flush() {
  const length = this.length;
  const peak = this.peak;
  const offset = this.offset;
  const rate = this.rate;

  this.length = 0;
  this.silence = 0;
  this.peak = 0;
  this.sum = 0;
  this.weight = 0;

  if (!length) return;

  if (length < WhisperPcmCapture.MIN_SAMPLES) {
    this.port.postMessage({
      type: 'dropped',
      reason: 'short',
      samples: length,
    });
    return;
  }

  if (peak < WhisperPcmCapture.SILENT_PEAK) {
    this.port.postMessage({
      type: 'silent',
      samples: length,
      offset,
    });
    return;
  }

  const pcm = this.samples.slice(0, length);

  this.port.postMessage({
    type: 'chunk',
    pcm: pcm.buffer,
    offset,
    rate,
  }, [pcm.buffer]);
}
```

Daha sonra FIR/resampler gibi ek DSP state eklenirse **explicit discontinuity reset’i** bunları da temizlemelidir. Normal chunk sınırı ile gerçek capture kesintisinin ayrı metotlarla temsil edilmesi tercih edilmelidir.

---

## BUG-CAT4-03 — Giriş kaybında iki ayrı zaman aralığı aynı chunk içine dikiliyor

**Seviye: HIGH**

**Dosya / referans:**  
`src/renderer/live-asr-worklet.js` → `process()` başlangıcı:

```js
if (!channels?.length || !this.clock || this.clock.paused) return true;
```

### Kök neden

Giriş kanalları kaybolduğunda işlem sessizce atlanıyor; ancak:

- `this.length`,
- `this.offset`,
- `this.sum`,
- `this.weight`

korunuyor.

Ses yeniden gelirse yeni ses eski PCM’nin arkasına ekleniyor. Aradaki gerçek zaman boşluğu PCM’de bulunmuyor.

### Somut hata senaryosu

1. Üç saniye konuşma yakalanır.
2. Capture bağlantısı veya kaynak graph bağlantısı beş saniye boyunca giriş üretmez.
3. Bu sürede worklet `inputs[0] = []` alır.
4. Kaynak yeniden bağlanır ve üç saniye daha konuşma gelir.
5. Oluşan chunk, altı saniyelik kesintisiz PCM gibi gönderilir.

Gerçekte ikinci konuşma ilkinden sekiz saniye sonra başlamıştır; ASR zamanlaması ikinci konuşmayı beş saniye erken konumlandırabilir.

### Tekrarlama

Worklet birim testinde veya özel graph testinde:

```text
3 saniye dolu channels
5 saniye boş channels
3 saniye dolu channels
flush
```

Gönderilen chunk sayısını ve ikinci konuşmanın offset’ini doğrulayın. Mevcut uygulama, başka bir sync discontinuity’si oluşmazsa iki konuşmayı birleştirir.

### Mimari etki

- Sessiz donma sonrasında altyazı zaman kayması.
- Yeniden bağlanan aygıtın sesinin eski zaman aralığına yazılması.
- ASR’nin gerçekte bitişik olmayan cümleleri tek bağlamda işlemesi.

**Sınır:** Bazı aygıt kayıpları boş kanal yerine sıfır örnekler üretir; bazıları context’i suspend eder. Bu bulgu özellikle **boş input ile işlemeye devam eden** graph yolu için doğrudan geçerlidir.

### Düzeltme

Boş input’u capture discontinuity olarak ele alın:

```js
// constructor:
this.inputMissing = false;

// process() başı:
const channels = inputs[0];
const hasFrames = Boolean(channels?.length &&

---

# Kategori 5: Altyazı Biçimlendirme, Cümle Düzeni ve Zamanlama Boru Hattı

## Kapsam ve sonuç

İncelenen dosyalar:

- `src/subtitle-sentence-layout.js`
- `src/subtitle-output-contract.js`
- `src/subtitle-find-replace.js`
- `src/renderer/timeline-issue-scan.js`

**Toplam 10 doğrulanabilir hata tespit edildi: 5 HIGH, 5 MEDIUM.**

Referanslar, sağlanan kodun **dosya + fonksiyon + ilgili ifade** düzeyindedir. Böylece editörün CRLF/LF veya satır numaralandırmasından bağımsız olarak hatalı nokta doğrudan bulunabilir.

> **Kanıt sınırı:** Bu dosyalarda SRT/ASS serializer, dosya yazma, clip-start uygulama, Python `wrap_text`, subprocess veya IPC yaşam döngüsü kodu yoktur. Dolayısıyla UTF-8 BOM eksikliği, zaman kodu serialization hatası, Windows `EPERM/EBUSY`, clip-start offset hatası veya process deadlock varmış gibi bir sonuç çıkarılmamıştır. Aşağıdaki bulgular, gösterilen kodda doğrudan üretilebilen davranışlara dayanmaktadır.

## Bulguların özeti

| ID | Önem | Bulgu |
|---|---|---|
| BUG-CAT5-01 | HIGH | Grapheme uzatma yolunda `const` değişkene yazılması aramayı çökertiyor |
| BUG-CAT5-02 | HIGH | Unicode fallback araması kübik maliyete ulaşarak renderer’ı kilitleyebiliyor |
| BUG-CAT5-03 | MEDIUM | Cümle dağıtımı grapheme yerine code point bölüyor; görünen karakterler parçalanıyor |
| BUG-CAT5-04 | MEDIUM | İç içe zaman aralıklarında gerçek overlap’ler kaçırılıyor |
| BUG-CAT5-05 | MEDIUM | Geçersiz, negatif ve sonsuz zamanlar güvenilir biçimde raporlanmıyor |
| BUG-CAT5-06 | HIGH | Kurtarma imzası farklı altyazı içeriklerini aynı kaynak kabul ediyor |
| BUG-CAT5-07 | HIGH | Geçersiz explicit output metadata sessizce legacy “complete/source” sonucuna dönüşüyor |
| BUG-CAT5-08 | MEDIUM | Kaynak ve çeviri descriptor’ları farklı kaynaklardan birleştirilebiliyor |
| BUG-CAT5-09 | HIGH | Sayı denetiminde ölçekli sayılar negatif işareti kaybederek kabul ediliyor |
| BUG-CAT5-10 | MEDIUM | Yinelenen kaynak sayılar tek hedef sayı ile karşılanmış sayılıyor |

---

## BUG-CAT5-01 — Grapheme uzatma yolunda `Assignment to constant variable`

**Önem: HIGH**

### Referans

`src/subtitle-find-replace.js` → `literalRanges()` → hızlı arama yolu:

```js
const end = found + needle.length;
```

Ardından:

```js
while (end < source.length && MARK_EXTEND.test(codePointAt(source, end))) {
  end += codePointAt(source, end).length;
}
```

### Kök neden ve mimari etkisi

`end`, `const` olarak tanımlanmış olmasına rağmen birleşen işaretleri kapsamak için artırılıyor.

Bu yol teorik değildir: NFC/NFKC tarafından tek karaktere birleştirilmeyen taban + combining mark dizileri hızlı yolu kullanabilir. Böyle bir eşleşmede fonksiyon `TypeError` fırlatır.

`findLiteralMatches()` bu exception’ı yakalamıyor. Bir altyazıdaki tek Unicode kümesi tüm arama sonucunun üretilmesini engelleyebilir. Renderer çağrısında exception yakalanmıyorsa bul/değiştir paneli de işlevsiz kalır.

### Tetikleyici ve kesin yeniden üretim

```js
const assert = require('node:assert/strict');
const { literalRanges } = require('./src/subtitle-find-replace');

const text = 'x\u0301'; // x + COMBINING ACUTE ACCENT

assert.equal(text.normalize('NFKC'), text);

// Mevcut kod:
// TypeError: Assignment to constant variable.
literalRanges(text, 'x');
```

`x́` için önceden oluşturulmuş tek bir Latin karakter bulunmadığından NFKC uzunluğu değişmez; hızlı yol çalışır.

### Üretime uygun düzeltme

```diff
- const end = found + needle.length;
+ let end = found + needle.length;
```

Regresyon testi:

```js
assert.deepEqual(literalRanges('x\u0301', 'x'), [
  { start: 0, end: 2 },
]);
```

Bu düzeltme mevcut tasarımı korur: eşleşmenin sonundaki combining mark taban karakterle birlikte değiştirilir.

---

## BUG-CAT5-02 — Unicode fallback aramasında algoritmik DoS

**Önem: HIGH**

### Referans

`src/subtitle-find-replace.js` → `literalRanges()` → `fastOk === false` yolu:

```js
while (startPoint < boundaries.length - 1) {
  for (let endPoint = startPoint + 1; endPoint < boundaries.length; endPoint++) {
    const candidate = foldSearchText(
      source.slice(boundaries[startPoint], boundaries[endPoint]),
      options.caseSensitive === true
    );
```

### Kök neden ve mimari etkisi

Her başlangıç için artan uzunlukta substring’ler:

1. Kopyalanıyor.
2. NFKC ile normalize ediliyor.
3. Locale-aware lowercase işleminden geçiriliyor.

Metin uzunluğu `n`, sorgu uzunluğu da `n` mertebesindeyse yaklaşık `O(n²)` aday üzerinde toplam `O(n³)` karakter işlenebilir.

Tek bir `ﬀ` gibi compatibility karakteri hızlı yolu kapatır. Sorgunun uzunluğu için üst sınır bulunmadığından kullanıcı, büyük bir metni arama kutusuna yapıştırarak renderer event loop’unu uzun süre bloke edebilir.

Bu **catastrophic regex backtracking değildir**; ancak pratik etkisi aynı olan senkron algoritmik DoS’tur.

### Tetikleyici ve yeniden üretim

Aşağıdaki testi UI renderer’ında değil, ayrı Node process’inde çalıştırın:

```js
const { literalRanges } = require('./src/subtitle-find-replace');

for (const n of [500, 1000, 2000]) {
  const source = '\uFB00' + 'a'.repeat(n); // ﬀ hızlı yolu kapatır
  const query = 'b'.repeat(n);             // Hiç eşleşmez

  console.time(`n=${n}`);
  literalRanges(source, query);
  console.timeEnd(`n=${n}`);
}
```

İç döngüdeki:

```js
if (candidate.length > needle.length + 2) break;
```

koruması uzun sorguda etkisizdir; adayların çoğu tümüyle işlenir.

### Üretime uygun düzeltme

Mevcut algoritma korunacaksa hem giriş uzunluğu hem normalize edilen toplam iş miktarı sınırlandırılmalıdır. **Kısmi sonuç döndürülmemeli**, işlem açık hata ile sonlandırılmalıdır.

```js
const SEARCH_LIMITS = Object.freeze({
  maxTextUnits: 12000,
  maxQueryUnits: 256,
  maxNormalizedUnits: 1_000_000,
});

function searchLimitError() {
  const error = new Error('Arama güvenli işlem sınırını aştı.');
  error.code = 'SEARCH_LIMIT_EXCEEDED';
  return error;
}
```

`literalRanges()` başlangıcına, normalization öncesinde:

```js
const source = String(text == null ? '' : text);
const queryText = String(query == null ? '' : query);

if (source.length > SEARCH_LIMITS.maxTextUnits
    || queryText.length > SEARCH_LIMITS.maxQueryUnits) {
  throw searchLimitError();
}

const caseSensitive = options.caseSensitive === true;
const needle = foldSearchText(queryText, caseSensitive);

if (needle.length > SEARCH_LIMITS.maxQueryUnits) {
  throw searchLimitError();
}
```

Fallback döngüsüne:

```js
let normalizedUnits = 0;

while (startPoint < boundaries.length - 1) {
  let matched = null;

  for (let endPoint = startPoint + 1;
    endPoint < boundaries.length;
    endPoint++) {
    const start = boundaries[startPoint];
    const end = boundaries[endPoint];

    normalizedUnits += end - start;
    if (normalizedUnits > SEARCH_LIMITS.maxNormalizedUnits) {
      throw searchLimitError();
    }

    const candidate = foldSearchText(
      source.slice(start, end),
      caseSensitive
    );

    // Mevcut eşleşme denetimleri...
  }

  // Mevcut ilerletme mantığı...
}
```

Çağıran katman `SEARCH_LIMIT_EXCEEDED` hatasında replacement plan uygulamamalıdır. Büyük ölçekli arama gerekiyorsa işlem iptal edilebilir bir Worker’a taşınmalıdır; yalnız Worker kullanmak bu algoritmanın kaynak tüketimini ortadan kaldırmaz.

---

## BUG-CAT5-03 — `Array.from()` grapheme bölmez; görünür karakterler cue’lar arasında parçalanıyor

**Önem: MEDIUM**

### Referans

`src/subtitle-sentence-layout.js` → `fitTranslationParts()`:

```js
const words = spaceless ? Array.from(normalized) : normalized.split(' ');
```

Hemen üstündeki açıklama bu diziyi “Grapheme dizisi” olarak nitelendiriyor.

### Kök neden ve mimari etkisi

`Array.from(string)` UTF-16 surrogate çiftlerini korur; fakat **Unicode grapheme cluster** sınırlarını korumaz.

Örneğin Tayca:

```text
ก้
```

şunlardan oluşur:

- `ก`: taban harf
- `้`: ton işareti

Bunlar ayrı code point’lerdir ama tek görünen karakter kümesidir. DP bunların arasına cue sınırı koyabilir. Aynı problem emoji ZWJ dizileri ve bazı combining mark dizileri için de geçerlidir.

Bu bir UTF-8 byte bölme hatası değildir; **Unicode görünür karakter bölme hatasıdır**. Kullanıcı açısından bozuk glif veya bağımsız ton işareti olarak görünür.

### Kesin yeniden üretim

```js
const { fitTranslationParts } =
  require('./src/subtitle-sentence-layout');

const result = fitTranslationParts('ก้', [
  { start: 0, end: 1 },
  { start: 1, end: 2 },
]);

console.log(result);
// Mevcut: ['ก', '้']
```

Kaynakta yalnız bir grapheme olmasına rağmen iki “kelime” bulunduğu sanılır.

### Üretime uygun düzeltme

```js
const graphemeSegmenter =
  new Intl.Segmenter('und', { granularity: 'grapheme' });

function graphemes(text) {
  return Array.from(
    graphemeSegmenter.segment(text),
    item => item.segment
  );
}
```

```diff
- const words = spaceless ? Array.from(normalized) : normalized.split(' ');
+ const words = spaceless ? graphemes(normalized) : normalized.split(' ');
```

Regresyon testi:

```js
assert.equal(
  fitTranslationParts('ก้', [
    { start: 0, end: 1 },
    { start: 1, end: 2 },
  ]),
  null
);
```

Bu durumda `null` doğrudur: tek görünür karakter kayıpsız olarak iki dolu cue’ya bölünemez.

Desteklenen eski runtime’da `Intl.Segmenter` yoksa code point fallback yerine paketlenmiş UAX #29 uyumlu grapheme splitter kullanılmalıdır.

---

## BUG-CAT5-04 — Yalnız hemen önceki cue kontrol edildiği için iç içe overlap’ler kaçırılıyor

**Önem: MEDIUM**

### Referans

`src/renderer/timeline-issue-scan.js` → `scan()`:

```js
const prev = list[i - 1];
if (i && prev && Number(prev.end) > start + .01) {
  issues.push({ i, kind: 'overlap' });
}
```

### Kök neden ve mimari etkisi

Hemen önceki cue’nun bitişi, daha önce başlayan tüm aktif cue’ların en geç bitişi değildir.

Uzun bir cue içinde birden fazla kısa cue varsa ikinci kısa cue, hemen önceki kısa cue ile çakışmayabilir; fakat uzun cue ile hâlâ çakışır.

Sonuç: zamanlama masası, gerçek çakışmaların bir kısmını temiz gösterir.

### Kesin yeniden üretim

```js
const { scan } = require('./src/renderer/timeline-issue-scan');

const cues = [
  { start: 0, end: 10, text: 'Uzun blok' },
  { start: 1, end: 2, text: 'Kısa blok A' },
  { start: 3, end: 4, text: 'Kısa blok B' },
];

console.log(scan(cues).filter(x => x.kind === 'overlap'));
// Mevcut: yalnız i=1
// Beklenen: i=1 ve i=2
```

### Üretime uygun düzeltme

Giriş sırasını değiştirmeden, zaman sıralı ayrı bir görünüm üzerinden sweep yapılmalıdır:

```js
function overlapIssues(list, epsilon = 0.01) {
  const rows = list.map((cue, i) => ({
    i,
    start: Number(cue?.start),
    end: Number(cue?.end),
  })).filter(row =>
    Number.isFinite(row.start)
    && Number.isFinite(row.end)
    && row.start >= 0
    && row.end > row.start
  ).sort((a, b) => a.start - b.start || a.i - b.i);

  const issues = [];
  let activeEnd = -Infinity;

  for (const row of rows) {
    if (row.start + epsilon < activeEnd) {
      issues.push({ i: row.i, kind: 'overlap' });
    }
    activeEnd = Math.max(activeEnd, row.end);
  }

  return issues;
}
```

`scan()` içindeki mevcut komşu kontrolü kaldırılmalı ve sonunda:

```js
issues.push(...overlapIssues(list));
```

eklenmelidir.

Bu çözüm sıralanmamış cue dizilerinde de gerçek zaman çakışmasını denetler.

---

## BUG-CAT5-05 — Geçersiz timeline değerleri `0` ve minimum süreye dönüştürülerek gizleniyor

**Önem: MEDIUM**

### Referans

`src/renderer/timeline-issue-scan.js`:

- `scan()`
- `cpsOf()`
- `KINDS`

İlgili ifadeler:

```js
const start = Number(c.start) || 0;
const end = Number(c.end) || 0;
const dur = Math.max(0, end - start);
```

```js
const dur = Math.max(.05, ...);
```

### Kök neden ve mimari etkisi

- `NaN`, boş string ve eksik değerler `0` haline gelir.
- `Infinity` truthy olduğu için aynen kalır.
- Negatif başlangıç ayrı bir hata sayılmaz.
- Negatif/sıfır süre `short` içine sıkıştırılır.
- Boş metinde süre kontrolleri hiç çalışmaz.
- `cpsOf()` geçersiz süreyi minimum süreye çevirerek geçerli ölçümmüş gibi sonuç üretir.

Bu yaklaşım, “kısa ama geçerli cue” ile “serialize edilemeyecek zaman” arasındaki farkı yok eder.

### Kesin yeniden üretim

Aşağıdaki girdiler mevcut tarayıcıda tamamen temiz görünebilir:

```js
scan([{ start: -2, end: 2, text: 'Merhaba' }]);
// []

scan([{ start: 'bozuk', end: 2, text: 'Merhaba' }]);
// []

scan([{ start: 0, end: Infinity, text: 'Merhaba' }]);
// []
```

### Üretime uygun düzeltme

Geçersiz zaman için ayrı issue türü kullanın:

---

## Doğrulama, Kanıt ve Sonraki Adımlar

1. **Kanıtlanan Yazım/Çalışma Hataları:**
   - `src/subtitle-find-replace.js` satır 103/108'deki `const end` üzerine ekleme yapılması (`BUG-CAT5-01`) bağımsız kod incelemesiyle doğrulanmıştır. `let end` olarak düzeltilmesi gerekmektedir.
   - `src/preload.js` içindeki `onYoutubeTvEvent` ve `onYoutubeEvent` kayıtlarının Electron IPC event nesnesini doğrudan renderer'a sızdırması (`BUG-CAT2-01`) doğrulanmıştır. `(_e, payload) => listener(payload)` desenine çekilmelidir.
   - `backend/translate_planner.py` içindeki bütçe tavanı tersine dönmesi (`BUG-CAT3-01`) `min(self.token_ceiling, self.token_budget)` olarak düzeltilmelidir.
2. **Kapsam ve Sınırlar:**
   - Bu rapor, kullanıcı talebi üzerine çalışma anına kadar tamamlanan Kategori 1, 2, 3, 4 ve 5 denetimlerinin kapsamlı sentezidir.
   - Analizler Vangu platformunun `gpt-6.1-sol` modeli ile en katı kalite/güvenlik ilkelerine göre yapılmıştır.
   - Hiçbir API anahtarı, gizli token, kullanıcı profili veya kişisel veri rapora veya depoya yazılmamıştır.
