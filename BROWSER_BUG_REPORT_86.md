# R85 uygulama turu doğrulaması — commit `bee53b8`

**Tarih:** 2026-09-20

**Kapsam:** `3038a4ced824ba2e0089a93c650d7d7447883b81..bee53b89717b9597ee8fecc4827bcb0a59abc6a8`

**Yöntem:** Kaynak/diff incelemesi, sentetik ve kişisel veri içermeyen deterministik problar, tam Node+Python paketi, Electron bridge ve Electron smoke tekrarları.

**Sınır:** Bu tur salt okunur doğrulamadır; ürün kodu değiştirilmedi.

## Kısa hüküm

Paketin büyük bölümü yararlı ve mevcut test paketini bozmuyor. Sırların argv'den çıkarılması, hassas URL parametreleri, CEA checkpoint kimliği, `mediaTypes`, arama Unicode katlaması, negatif cue, lifecycle ve sayfa-çeviri kuşağı gibi birçok değişiklik kaynak düzeyinde doğru uygulanmış.

Ancak **“R85 tamamlandı” sonucu doğru değil**. Aşağıda dört kesin ürün açığı, bir yeni arama regresyonu ve bir test/kanıt açığı var. Özellikle video içeren `.wbp` paketi hâlâ mutlak yerel yolu sızdırıyor; 180 günlük track budaması workspace/session referansını hâlâ silebiliyor; `.bak` aynalama hatası başarı gibi raporlanıyor; tanı gerilemesi 193 saniyeden sonra yeniden saniyelik log seline dönüyor.

## Doğrulanan başarılı kısımlar

- `browser-sensitive-keys`, translation archive, kalıcı medya URL'si ve ayar endpoint'i ortak hassas anahtar kümesine bağlandı; Invidious şifresi child env'e taşındı.
- `browser-cea-checkpoint.js:normalizeCue` artık `captionMode`, `speaker`, `language` ve güvenli `provenance.streamKey` alanlarını koruyor. Devir notundaki “yalnız undefined eklenmiyor” açıklaması eksik olsa da kod değişikliği B83-01'in köküne dokunuyor.
- Electron `media` istekleri `details.mediaTypes` üzerinden camera/microphone kararlarına ayrılıyor; kalıcı seçim bileşen izinlerine yazılıyor. `mediaKeySystem` destek listesinde ve bilinmeyen/default karar fail-closed.
- Unicode transcript/subtitle araması, fileId/fileName eşleştirmesi, boş redirect `Location`, negatif cue düşürme, `net-err-*`, CEA/çeviri yaşam döngüsü ve sayfa-çeviri stale-result kontrolleri kaynakta mevcut.
- `SequenceMatcher.quick_ratio()` yalnız üst-sınır elemesi olarak kullanılıyor; eşik geçen adaylarda gerçek `ratio()` ve semantik kapı korunuyor.
- `npm test` yükseltilmiş gerçek Windows ortamında **exit 0**; Node ve Python paketlerinin tamamı geçti. `node --check` ve dört Python modülü için `py_compile` geçti.
- `npm run test:electron-bridge` **exit 0**.

## Kesin açıklar / regresyonlar

### R86-01 · P2 — Video içeren workspace paketi mutlak yerel yolu hâlâ dışarı aktarıyor

**Kaynak:** `src/workspace-video-package.js:36-40`. `portable()` yalnız video `root` altında ise `{{ROOT}}/...` üretir; gerçek kullanımda katalog videosu genellikle `userData` kökünün dışındadır. Bu durumda `return ... : source` ham `C:\...` yolunu manifestte bırakır.

**Deterministik kanıt:** Geçici `userData` kökü ve onun dışındaki 1 baytlık sentetik MP4 ile `exportWithVideos` + `read` çalıştırıldı. Okunan manifest:

```json
{"source":"C:\\Users\\K\\AppData\\Local\\Temp\\wb-video-probe-...\\Movies\\secret-user-film.mp4","absolute":true}
```

Bu, `docs/devir/2026-09-20-0010.md:40` içindeki “video manifest source alanları da taşınabilir” iddiasını doğrudan çürütür. `tests/browser-report85-regressions.test.js:117` yalnız videosuz çekirdek `.wbp` paketini sınar.

**Kabul koşulu:** Manifestte kaynak makine yolu yerine kaynakla eşleşen kararlı, paket-içi bir takma kimlik kullanılsın; `extract()` sonrasında `videoMappings` bu kimliği yeni yerel hedefe bağlasın. Kök dışı sentetik video paketi açıldığında manifestin hiçbir UTF-8 alanında eski mutlak yol veya kullanıcı dizini bulunmamalı.

### R86-02 · P2 — B83-27 yalnız `sweepOrphans` için düzeltildi; `pruneTracks` workspace referansını hâlâ siliyor

**Kaynak:** `src/main.js:2524-2544`. Kod önce `candidate.pruneTracks()` sonucundaki her `asset_path` için `removeTrack()` çağırıyor; açık sekme/session/workspace `trackRefs` kümesi ancak bundan **sonra** hazırlanıp `sweepOrphans()`'a veriliyor.

**Etki:** Workspace'te bağlı, fakat watch-index yaşı 180 günü aşmış bir altyazı varlığı açılışta önce budanıp diskten silinebilir. Sonraki referans toplama artık silinmiş dosyayı geri getiremez. B83-27'nin 30 günlük orphan kolu düzelmiş, 180 günlük prune kolu açık kalmıştır.

**Kabul koşulu:** Tüm canlı `assetId` referansları prune öncesinde toplanmalı; `pruneTracks` korunan asset kimliklerini almıyorsa dönüş satırları silinmeden önce filtrelenmeli veya API buna göre genişletilmeli. 181 günlük track + yalnız workspace `trackRef` fixture'ı hem index satırını hem JSON/SRT çiftini korumalı; gerçekten referanssız eş fixture silinmeli.

### R86-03 · P3 — `.bak` gizlilik aynalaması hata verdiğinde işlem yine başarılı sayılıyor

**Kaynak:** `src/browser-session-store.js:329-330`, `src/main.js:2390-2392` ve `3601-3617`. Silme sonrası ana dosya yazılıyor, ardından `.bak` kopyasının hatası yutuluyor.

**Deterministik kanıt:** `writeBrowserSessionAtomic(..., {mirrorBackup:true})` için `copyFileSync` zorla `EACCES` attı. Sonuç:

```json
{"result":{"ok":true},"primary":[],"backup":"SECRET-OLD"}
```

Yani kullanıcıya sıfırlama başarılı görünüyor, fakat silinen veri yedekte kalıyor. `BrowserNoteStore.flush()` ters yönde tutarsız: ana dosya rename edildikten sonraki backup hatasını dışarı atıyor ve bellekte kaydı geri koyuyor; disk ile bellek ayrışabiliyor. Ayrıca B83-34'te anılan `watch-library-store` bu committe değiştirilmedi; tombstone/backup saklama sözleşmesi ayrı açık kalıyor.

**Kabul koşulu:** Silme işlemi ana+yedek için tek, açıkça tanımlanmış transaction sonucu vermeli. Backup aynalanamazsa başarı dönmemeli ve ana/bellek durumu atomik olarak geri alınmalı; ya da güvenli tombstone ile bir sonraki açılışta eski backup'ın dirilmesi kesin engellenmeli. History, places, session ve note için fault-injection matrisi; watch-library için veri saklama/undo politikasını belgeleyen test eklenmeli.

### R86-04 · P3 — Tanı “üstel gerilemesi” 128/192 saniye sonrasında saniyelik log seline dönüyor

**Kaynak:** `src/browser-playback-diagnostics.js:425-434`. Eşik `2 ** Math.min(emits, 4)` ile 16x'te sabitleniyor, fakat `since` sıfırlanmıyor. Toplam süre sabit eşiği geçince her sonraki örnek eşik koşulunu yeniden sağlıyor. Üstelik ayrıntıdaki saniye değeri değiştiği için fingerprint dedupe bunu durdurmuyor.

**Deterministik kanıt:** 1 saniyelik sabit stall örnekleri 230 saniyeye kadar beslendi. Emisyonlar önce 13/25/49/97/193 sn oldu, sonra **194, 195, 196...230** her saniye devam etti; toplam 42 kayıt.

**Kabul koşulu:** Gerileme tavanında dahi son emisyon zamanı baz alınmalı veya sonraki eşik monoton artmalı. 10 dakikalık 1 Hz stall probunda kayıt sayısı belirlenmiş küçük bütçeyi aşmamalı; son 60 saniyede her saniye kayıt üretilmemeli. Kare-durgunluğu kolu da aynı test matrisine girmeli.

### R86-05 · P3 — Tam-transkript niyet kökleri ilgisiz “tamamen/tamamla” sorularını dağıtılmış aramaya çeviriyor

**Kaynak:** `src/browser-transcript-search.js:39-40`. `word.startsWith('tamam')`, “tamamı” için ek toleransı sağlarken “tamamen” ve emir “tamamla”yı da özet/tüm-transkript niyeti sayıyor.

**Deterministik kanıt:** 20 sentetik cue ile:

- `Bu iddia tamamen yanlış mı?` → `coverage: distributed`
- `Bu işi tamamla` → `coverage: distributed`
- `Videoyu özetle` → `coverage: distributed` (doğru pozitif)

**Etki:** Belirli bir iddiayı soran AI isteğine videonun dört yanından ilgisiz kanıt eklenebilir; bağlam kalitesi ve token maliyeti bozulur.

**Kabul koşulu:** Kabul edilen niyet biçimleri açık kelime/ek listesiyle sınırlandırılmalı (`tamamı`, `tamamını`, `tümü`, `bütünü`, `özetle` vb.). Yukarıdaki iki negatif ve en az altı Türkçe çekimli pozitif testlenmeli.

## Test ve teslim iddiası değerlendirmesi

### R86-06 · Test açığı — 42 dosyalık değişiklik için yeni dosyada yalnız 12 dar senaryo var

`tests/browser-report85-regressions.test.js` 12/12 geçiyor; fakat CEA sunum kimliği, media/mediaKeySystem matrisi, `.bak` faultları, prune koruması, video paket yolu, uzun-stall gerilemesi, transcript niyet negatifleri ve yaşam döngüsü yarışlarının çoğu bu dosyada yok. Bazıları eski testlerle dolaylı kapsanıyor, yukarıdaki beşi yakalanmıyor.

### Electron smoke sonucu

- İlk güncel `--all` turu: **18/20**; bu kez başarısızlar `electron-browser-menu-visual` ve `electron-browser-video-e2e` idi. Devir notundaki `browser-ass` + `catalog-roadmap` sonucu tekrar etmedi; ikisi bu turda geçti.
- İki başarısız smoke üç kez birlikte tekrarlandı: tur 1 yalnız menu başarısız, tur 2 yalnız video-e2e başarısız, tur 3 ikisi de geçti.
- Sonuç: Bunlar şu anda **nondeterministik test/harness açığıdır**. “Yalnız UnknownVizError ve kod dışı” şeklindeki kesin kapanış kanıtlanmış değildir; fakat üç tekrardaki değişken imza da sabit bir ürün regresyonunu göstermiyor.

## Başka modele verilecek net iş listesi

1. R86-01 video manifest kaynak kimliğini takma kimliğe çevir; dış-kök gerçek yolun pakete girmediğini byte aramasıyla test et.
2. R86-02 referans kümesini `pruneTracks` öncesine taşı ve 181 günlük korunan/referanssız çift fixture ekle.
3. R86-03 `.bak` aynalamasını fault-safe transaction yap; dört store + watch-library politikasını test et.
4. R86-04 stall/black-frame gerilemesini tavan sonrası sel üretmeyecek biçimde düzelt; 10 dakikalık sanal saat testi ekle.
5. R86-05 transcript intent eşleşmesini çekimli whitelist'e daralt; pozitif/negatif dil testleri ekle.
6. Electron menu/video smoke'larının bekleme ve ekran boyama koşullarını deterministik yap; en az üç ardışık `--all` turunda 20/20 istemeden “kapandı” deme.

## Koşulan doğrulamalar

- `node tests/browser-report85-regressions.test.js` — 12/12 geçti.
- `npm test` — yükseltilmiş gerçek Windows ortamında exit 0, “Tüm testler geçti”.
- `npm run test:electron-bridge` — exit 0.
- `node tests/run-electron-smokes.js --all` — 18/20.
- `node tests/run-electron-smokes.js browser-menu-visual browser-video-e2e` — üç tur: 1/2, 1/2, 2/2.
- `node --check src/main.js`, `src/preload.js`, `src/renderer/renderer.js` — geçti.
- `py_compile` (`transcribe.py`, `invidious.py`, `subtitle_sdh.py`, `translation_memory.py`) — geçti.

## Sonuç

`bee53b8` geri alınacak başarısız bir paket değildir; çok sayıda gerçek düzeltme içerir. Fakat teslim özeti kapsamı fazla geniş kapatmış ve kritik kenarları test etmemiştir. **Karar: kısmen başarılı, ek düzeltme gerekli.**
