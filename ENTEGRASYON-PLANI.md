# Entegrasyon Planı — kalan altsistemleri master'a taşı

Bu dosya, başka bir AI ajanına verilecek **tam ve kendine yeten** iş tanımıdır.
Önceki konuşmayı bilmeni gerektirmez.

---

## 0. Başlangıç durumu (doğrula, varsayma)

```bash
git log --oneline -1
```

Beklenen: `840f661 docs: entegrasyon plani durum tablosuyla guncellendi`. Ayrıca
`git status --short` boş olmalı ve `npm test` "Tüm testler geçti" demeli
(**120 test dosyası**: 112 Node + 8 Python). Bu üçü tutmuyorsa dur ve bildir.

Tam takım artık **~10 dakika** sürüyor (10.000 kayıtlık kütüphane performansı,
10.000 altyazı dosyalı arama ölçümü, 52.000 vakalık ayrıştırıcı fuzz). Kural
"commit öncesi yeşil" olarak kalıyor; geliştirme sırasında hedefli testleri
koşmak makul. Koşuyu yarıda kesersen o koşu **geçerli sayılmaz** — sonuna kadar
bekle ve gerçek çıkış kodunu gör.

Uygulamayı çalıştırman gerekirse `start.bat` kullan — `npm start` tek başına
çalışmaz, cuDNN/cuBLAS DLL'leri PATH'e `start.bat` tarafından ekleniyor.

## 1. Bağlam: bu iş neden bu şekilde yapılıyor

Depoda **40 birleşmemiş dal / 139 commit** var. Toplu birleştirme denendi ve
ölçülerek reddedildi: en kolay dal (`whard-32`) bile **9 anlamsal çakışma**
verdi — iki taraf aynı fonksiyonu farklı yönlerde geliştirmiş, satır seçmek
yetmiyor. Örnek: `write_json`'a master `segment_metrics`, dal `segment_words`
eklemiş; doğru çözüm ikisini de tutmaktı.

Bunun yerine işe yarayan yöntem: **dalın kodunu değil testlerini master'a getir,
çalıştır.** Test yürütülebilir şartnamedir.

Bu yöntemle 58 test master'a karşı koşturuldu ve 8 gerçek hata bulunup
**hepsi düzeltildi** (JSON re-export'ta veri kaybı, ASS çıktısının bozulması,
TTML'de karesel ayrıştırma, kütüphane aramasının ana süreci 1,7 sn dondurması
vb.). Yani **master hiçbir dalın gerisinde değil.** Kalan iş, master'ın hiç
sahip olmadığı 8 altsistemi getirmek.

## 2. Değişmez kurallar

1. **`npm test` yeşil olmadan commit yok.** Her adımın sonunda tam koş.
2. **Testi geçirmek için testi gevşetme.** Bir assertion kalıyorsa iki ihtimal
   var: kod eksik (düzelt) ya da test eski sözleşmeye göre yazılmış (o zaman
   testi *uyarla* ve nedenini commit mesajına yaz). Assertion silmek üçüncü bir
   seçenek değil.
3. **Varlık ≠ doğruluk.** "Bu düzeltme master'da var mı?" sorusunu fonksiyon adı
   arayarak cevaplama. Geçmişte `reexport_from_json` vardı ama kaynak dosyanın
   üzerine yazıyordu (veri kaybı). Her zaman **çalıştırarak** doğrula.
4. **Test edilen kodu atlayarak testi geçirme.** Yaşanmış örnek: JSON
   re-export'taki kelime çoğalması `shutil.copyfile` ile "çözüldü" — test geçti
   ama bozuk segment ayıklaması kayboldu ve `done` olayı 1 segment derken
   dosyada 6 segment kaldı.
5. **Aşırı düzeltme yapma.** ffmpeg hata mesajından yol sızıntısı temizlenirken
   stderr tamamen atılmıştı ve teşhis kabiliyeti yok oldu. Doğru ayrım:
   kullanıcıya giden metin sabit/Türkçe/yolsuz, **günlüğe** teknik ayrıntı yazılır.
6. **Tek modül = tek commit = tek `--ff-only` birleştirme.** Toplu ilerleme yok.
7. **Silme yok:** `trial/tum-testler` ve `codex/*` dalları korunacak.

## 3. Her kalem için uygulanacak tarif

```bash
git worktree add -b feat/ADI /tmp/wt-ADI master
```

Sonra sırayla: worktree'ye gir, `git checkout KAYNAK-DAL -- MODUL TEST` ile
dosyaları al, önce yalnız o testi koş (`node tests/ADI.test.js`), saf mantık
testleri genelde hemen geçer, kalan "üretim bağları/wiring" testi için
`main.js` / `renderer.js` / `preload.js` bağlantısını **yaz**, `npm test` ile
tam koş, commit et, ana depoda `git merge --ff-only feat/ADI` yap ve worktree'yi
kaldır.

**Beklenti:** Her kalemin saf mantık testleri master'da zaten geçiyor (ölçüldü).
Kalan tek şey bağlantı. Asıl iş orada.

## 4. DURUM (2026-09-08)

| Kalem | Durum |
|---|---|
| K1 kütüphane deposu bağlantısı | ✅ `34c807d` |
| K2 yt-dlp atomik runtime | ✅ `1d697ae` |
| K3 ayar güvenliği | ✅ `98f8369` |
| K4 kuyruk yaşam döngüsü | ✅ `b7d7ffc` |
| K5 tek-yazar + kapanış flush'ı | ✅ `6392461` |
| K8 CDP sızıntısı + izole ölçüm | ✅ `da0c4c6` (kısmi — aşağıya bak) |
| **K6 pipeline iptal/temizlik** | ⛔ **açık** |
| **K7 renderer durum modeli / a11y** | ⛔ **açık** |

**K6 neden açık:** Kaynak dal `backend/transcribe.py`'de 146 satırlık boru hattı
değişikliği ve 35 checkpoint noktası (`("stage", "point")`) gerektiriyor; ayrıca
`OutputTransaction` ile çok-dosyalı işlem yazımı. Bu bir bağlantı işi değil, boru
hattı yeniden yazımı — ve `transcribe.py` master'da o daldan bu yana epey değişti.
Kendi oturumunda, adım adım yapılmalı. Not: master zaten dosya BAŞINA atomik yazıyor
(`atomic_text_writer`, `writeSubtitleAtomic`), eksik olan çok-dosyalı işlem ve
checkpoint'li iptal.

**K7 neden açık:** Bir erişilebilirlik + responsive tasarım geçişi (ARIA rolleri,
tablist semantiği, `:focus-visible`, üç kırılma noktası) — hata düzeltmesi değil.
`index.html` ve `styles.css` master'da en çok değişen dosyalar; testin aradığı
işaretlerin güncel karşılıkları tek tek bulunmalı.

**K8 kısmi:** İçindeki iki gerçek düzeltme alındı (yarış tabanlı CDP zaman aşımının
sızdırdığı zamanlayıcı; ölçümün gerçek kullanıcı profilini kirletmesi).
`src/resource-soak.js` ve testi ALINMADI: testin üçüncü iddiası tarayıcı yer imi
deposunu harness'ta çalıştırıyor ve master'ın güncel `normalizeBrowserPlaces`
zinciriyle (site profilleri, uyumluluk host'ları, `browser-place-url`) uyuşmuyor.
Modülü testsiz almak istemedim. Devam edecek kişi harness'a bu bağımlılıkları
enjekte edip fixture'ı güncel normalizasyona uyarlamalı.

## 4b. Kalemler — öncelik sırasıyla

### K1. `src/watch-library-store.js` bağlantısı — EN DİKKATLİ OLUNACAK

Modül master'da **ZATEN VAR**, 158 testiyle birlikte
(`tests/watch-library-migration.test.js`). Yeniden getirme. Eksik olan yalnız
`main.js` entegrasyonu. Kaynak referans: `codex/whard-26-watch-schema-migration-corpus`.

Kazanç: atomik yazım, yedekten onarım, tombstone'lu silme, sürümler arası şema göçü.

**Bağlamadan önce master'daki iki koruma depoya taşınmalı**, yoksa kaybolur:

1. `upsertWatchItem` boyut sınırı (128 KB patch / 256 KB birleşmiş kayıt) — tek
   dev IPC kaydının diski doldurmasını engelliyor. Deponun `upsert`'ü bilmiyor.
2. `library:remove` IPC'si notları, kelimeleri ve watch index'i **koruyarak**
   siliyor. Deponun sade `remove`'u bunu yapmıyor.

Ayrıca deponun `upsert`'ü `completionOverride`, `automaticCompleted` ve
`revision` alanlarını yönetiyor. Master'ın tamamlanma mantığı `03fb06f` ile
değişti — **çift yönetim olmadığını doğrula.**

Uyarı: bu kalem kullanıcının **gerçek izleme geçmişine** dokunuyor
(`userData/watch-library.json`) ve göç tek yönlü. Test etmeden bırakma.

### K2. `src/ytdlp-runtime.js`

Kaynak: `codex/whard-37-ffmpeg-ytdlp-burnin-windows-io` ·
Dosyalar: `src/ytdlp-runtime.js`, `tests/ytdlp-runtime.test.js`

`backend/update_ytdlp.py` **master'da zaten var ve 15 testi geçiyor.**

Kalan iş: `main.js`'teki `ipcMain.handle('maintenance:updateYtdlp')` handler'ı
venv içine `pip install` yapmayı bırakıp `backend/update_ytdlp.py`'yi çağırmalı
(sürümlü, atomik, geri alınabilir runtime dizini). Test bunu doğrudan kontrol
ediyor: kaynakta `backend', 'update_ytdlp.py` geçmeli ve updater bloğunda
`pip install` **geçmemeli**. Ayrıca aktif runtime'ın Python süreçlerine
taşınması bekleniyor (`pythonRuntimeEnv({ PYTHONIOENCODING ... })`).

### K3. `src/settings-security.js`

Kaynak: `codex/whard-31-settings-secrets-adversarial-import` ·
Dosyalar: `src/settings-security.js`, `tests/settings-security.test.js` ·
Durum: **13 test geçiyor, 3 bağlantı testi kalıyor.**

Kalan iş:

1. `main.js` import/export ve Python env yollarını güvenli yardımcılara bağlamalı
   (test `createBackupPayload` arıyor).
2. Renderer kalıcılık listeleri (`PERSIST_VALUE_CONTROLS` /
   `PERSIST_CHECKBOX_CONTROLS`) güvenlik şemasıyla **bire bir** eşleşmeli.
3. Tarayıcı yedek URL'si basic auth, hassas sorgu parametresi ve fragment
   secret'ı taşımamalı — bir URL temizleyici gerekiyor, master'da yok.

### K4. `src/renderer/queue-lifecycle.js`

Kaynak: `codex/whard-30-queue-crash-resume-exactly-once` ·
Dosyalar: `src/renderer/queue-lifecycle.js`, `tests/queue-lifecycle.test.js` ·
Durum: mantık testleri geçiyor, **1 bağlantı testi kalıyor.**

Kalan iş: üretim bağlantısı `jobId`, lifecycle scripti ve **app-close iptalini**
kullanmalı. Amaç, çökme sonrası kuyruğun tam-bir-kez devam etmesi: aynı iş iki
kez terminale ulaşmamalı.

### K5. `src/watch-library-state.js`

Kaynak: `codex/whard-29-watch-concurrent-writers-revision` ·
Dosyalar: `src/watch-library-state.js`, `tests/watch-library-concurrency.test.js`
(dal ayrıca `tests/validation.test.js` ve `tests/watch-library.test.js`
dosyalarını değiştirmiş — farkı incele) ·
Durum: **9 test geçiyor, 3 bağlantı testi kalıyor.**

Kalan iş — tek-writer garantisi:

1. İkinci uygulama örneği **tek-instance kilidiyle** kapatılmalı ve ilk pencere
   öne getirilmeli.
2. Yeniden etkinleştirme instance kilidiyle kapılı olmalı.
3. Kapanış handshake'i ACK ile **veya 750 ms timeout** ile sınırlanmalı.

K1 ile aynı dosyaya dokunuyor — **K1'den sonra yap.**

### K6. `src/pipeline-job.js`

Kaynak: `codex/whard-36-pipeline-cancel-transactional-cleanup` ·
Dosyalar: `src/pipeline-job.js`, `tests/pipeline-cancel.test.js`,
`tests/fixtures/pipeline-process-tree.py` ·
Durum: **7 test geçiyor, 1 bağlantı testi kalıyor.**

Kalan iş: `backend/pipeline_control.py` master'da **yok** — dalda var, getirilmeli.
Üretim bağı iş kimliği, temp dizini sahipliği ve transactional yazımı kullanmalı.
Amaç: iptal edilen işin yarım dosya ve artık süreç bırakmaması.

### K7. `src/renderer-ui-model.js`

Kaynak: `codex/whard-38-renderer-state-a11y-responsive-model` ·
Dosyalar: `src/renderer-ui-model.js`, `tests/renderer-state-a11y-responsive.test.js` ·
Durum: 4 test geçiyor; kalanlar renderer kaynak beklentileri.

Uyarı: `renderer.js` master'da en çok değişen dosya (kelime vurgusu, ayarlar
sekmesi, tarayıcı çalışma alanı). Testin aradığı kod dilimlerinin **güncel
karşılığını bul**, dalın eski halini kopyalama.

### K8. `src/resource-soak.js`

Kaynak: `codex/wl-49-resource-soak` ·
Dosyalar: `src/resource-soak.js`, `tests/resource-soak.test.js`,
`tests/run-resource-soak.js` ·
Durum: **3 test geçiyor, 3 bağlantı testi kalıyor.**

Kalan iş:

1. Soak koşucusu **geçici userData** ile `start.bat` üzerinden çalışmalı.
2. CDP hazırlık timeout'ları sonuçlanınca temizlenen **ortak yardımcıyı** kullanmalı.
3. Tarayıcı yerleri diskten **bir kez** okunmalı, yazım önbelleği yenilemeli.

En düşük öncelik: kullanıcıya doğrudan görünen bir şey değil, sızıntı testi.

## 5. Bitirme kriteri

Her kalem için: modül master'da, testi master'da, `npm test` yeşil, tek commit.
Hepsi bittiğinde `DEVIR-NOTU.md` güncellenmeli. `codex/*` dalları ancak
`git log --oneline master..DAL` ile o dalda başka bir şey kalmadığı doğrulandıktan
sonra silinebilir.

## 6. Sık düşülen tuzaklar (hepsi bu depoda yaşandı)

- **Çifte entity çözme:** `normalizeCues` zaten `cleanCueText` çağırıyor;
  ayrıştırıcıya ikinci bir çağrı eklenince `&amp;lt;` → `<` oldu. XSS yüzeyi.
- **Aşırı geniş reddetme:** kapanmamış tek bir TTML etiketi yüzünden belgenin
  **tamamı** atılıyordu. Bozuk kısmı kes, geçerli kısmı koru.
- **Görünmez karakter birikmesi:** ASS'te her ters bölüye word-joiner eklenince
  her yaz/oku turunda bir tane daha birikiyordu (1, 2, 3...). Hedefi daralt.
- **Regex fazla kaçırma:** Python r-string içinde `\\\\` **iki** ters bölü demektir;
  fazladan kaçırınca desen hiçbir şeyle eşleşmez ve sessizce hiçbir şey yapmaz.
- **Kısmi doğrulama:** yalnız kendi eklediğin testleri koşup "yeşil" demek.
  Master'ın kendi testleri iki regresyonu bu yüzden geç yakaladı.
  **Her zaman `npm test`.**
