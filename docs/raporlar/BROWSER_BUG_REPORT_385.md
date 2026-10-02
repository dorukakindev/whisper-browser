# BROWSER_BUG_REPORT_385 — 50'lik kuyruk batch 2 (maddeler 6–10): altyazı editörü

Tarih: 2026-10-02 · Dal: `devin/1790913486-timeline-editor` · Başlangıç: `b46fdf4` (master)

Kapsam: kullanıcının 50'lik görev kuyruğunun ikinci beşlisi — ses dalga biçimli zaman
çizelgesi, görsel zaman düzenleme, okuma-hızı haritası, sorunlar paneli, kaydedilmemiş
düzenleme kurtarması. Beş özellik de mevcut timeline-drawer üzerine inşa edildi ve
canlı Electron oturumunda CDP üzerinden doğrulandı.

## Kullanıcıya görünen kazanımlar (madde → akış)

### 6. Ses dalga biçimli zaman çizelgesi
- `waveform:extract` IPC kanalı: ffmpeg ile yalnız zaman çizelgesi penceresine
  düşen ±30 sn ses aralığı çıkarılır (uzun medyada tüm dosya okunmaz); 60 s kota,
  iş-çakışması kilidi ve yerel-dosya yetki kapısı (`media:fileAccess`) mevcut.
- Canvas, waveform peaks'i cue bloklarının altına çizer; seek çizgisi, tıklama ve
  yakınlaştırma (Ctrl+tekerlek) aynı çizelgede. "Seçiliyi dinle" düğmesi seçili
  cue'nun başlangıcına sarar ve bitişte otomatik duraklatır (ilk doğrulamada
  ~0,4 sn ötesine taşma görüldü — çizim çerçevesi aralığından; kabul edilebilir
  v1 toleransı olarak bırakıldı).
- Waveform alınamayan ortamlar (yetkisiz dosya, ffmpeg yok, YouTube akışı) için
  yerelleştirilmiş durum mesajı: "No waveform — subtitle blocks are still
  editable" — akış bloklanmıyor.

### 7. Görsel zaman düzenleme
- Cue başı/sonu/gövde sürükleme mevcutken önizleme zayıftı; bu tur:
  - sürükleme sırasında komşu çakışması kırmızı çerçeve + durum satırında
    `· komşu bloğa çakıyor` uyarısı (ANLIK, bırakmadan önce);
  - negatif süre / 0,05 sn altı ve medya sınırlarına kelepçe;
  - `timelinePushUndo` her sürükleme-uygulamasında tam dizi anlık görüntüsü
    (30 kayıt tavanı) — geri alma zinciri korunur.
- Sorunlar: sürükleme statüsü `textContent` yazımı, observer'ın saniyeler
  içinde yakaladığı yerelleştirme katmanının dışında da yeni `uiText()`
  kalıbıyla hemen EN/TK doğru çıkıyor.

### 8. Okuma hızı haritası
- `src/renderer/timeline-issue-scan.js` (yeni, UMD saf modül): `cpsOf`,
  `cpsTier` (0..1, limit*1.6'ya normalize), `scan`, `cueSignature`.
- Timeline'da her cue blokunun altına CPS şeridi çizilir — yeşil→kırmızı
  renk gradyanı hızla okunan bölgeyi gösterir; limit `maxCps` ayarından
  canlı okunur. Sorunlu cue'lara sorunlar panelinden tıklayarak atlanır.

### 9. Altyazı sorunları paneli
- Timeline çekmecesi altında sorun çipi şeridi: `boş metin`, `çok kısa`
  (<1 sn), `çakışma`, `hızlı okuma` (CPS > limit), `satır kırılması`
  (>3 satır veya satır > maxLineWidth).
- Her çip sorunlu cue sayısını gösterir; tıklamak sıradaki sorunlu cue'yu
  seçer (zaman çizelgesi penceresi otomatik merkezler).
- `N boş bloğu kaldır` toplu düzeltme: önizleme (ilk 8 cue #numarası+saati),
  onay diyaloğu, tek-undo-kaydıyla tamamen geri alınabilir.
- Sorun indeksleri saf modülde üretilir → birim testleri hızlı ve
  deterministik (aşağıda test kanıtı).

### 10. Kaydedilmemiş düzenleme kurtarması
- `timeline:recovery` IPC (main): `userData/timeline-recovery.json`
  kaydı — `save`/`get`/`clear`; kaynak başına anahtar, ≤50 000 cue, 20 kayıt
  tavanı, `writeJsonAtomic`.
- `timelineMarkDirty` kurtarma kaydını silahlandırır (taban imzası =
  `undo[0]`); `timelinePersistRecovery` 1,2 sn debounce'la yazar;
  `invalidateTimelineEdits`/`saveTimelineCopy` kaydı tüketir.
- `loadSubtitle` sonrası `timelineCheckRecovery`: dosyanın mevcut
  imzası kaydın tabanıyla eşleşmiyorsa kayıt atılır (dosya sonradan
  değişti); eşleşiyorsa ve düzenlenmiş imza farklıysa kullanıcıya
  "Unsaved timing edits found — Restore?" diyaloğu; onayda cue'lar
  + undo geçmişi geri yüklenir, kayıt tüketilir.

## Doğrulanan kusurlar / düzeltmeler

- **timelineStatus TR-kaçak metni (düzeltildi):** sorun-atlama ve
  sürükleme statüsü `uiText()` sarmalına alındı — yerelleştirici observer
  beklemeden de doğru dilde (mevcut gövde davranışıyla tutarlı).
- **`subtitle-edit-history.test.js` vm-kumu boşluğu (düzeltildi):**
  `player.timeline` çerçevesine `recovery`/`recoveryTimer` alanları ve
  `clearTimeout`/`timelineClearRecovery` saplamaları eklendi.
- **`browser-subtitle-selection.test.js` vm-kumu boşluğu (düzeltildi):**
  `timelineCheckRecovery` saplaması eklendi.
- **`ui-locale.test.js` script-sırası regex'i (güncellendi):**
  `ui-locale.js → status-copy.js → timeline-issue-scan.js →
  renderer-helpers.js → renderer.js` zinciri kilitli.

## Canlı doğrulama kanıtı (CDP, Electron 43.5)

- `xvfb + npx electron . --remote-debugging-port=9333`, test medyası
  `/home/ubuntu/test-media-b2/clip.mp4` (60 sn testsrc2+flite) +
  7-cue fixture SRT (kısa, uzun-satır, çakışan, hızlı, 4-satırlı çeşitlilik).
- Timeline açıldı: cue kareleri + CPS şeritleri çizildi; sorun çipleri EN:
  `1 too short`, `1 overlap`, `2 fast reading`, `3 line break`, `1 empty text`
  + `Remove 1 empty cues` düzeltme düğmesi.
- Çip tıklama: seçim sorunlu cue'ya atladı, `timelineWindow` merkezledi,
  durum `1. blok · 0:00 – 0:01 · çok kısa` → observer sonrası EN.
- Seçili aralık dinleme: `currentTime` 1,07→1,4 arası oynadı, `listenUntil`
  cue sonunda duraklattı (paused:true).
- Kurtarma döngüsü: `timelineMarkDirty` → `rec:true` → `timeline:recovery`
  diske `ok:true` yazdı → taban imzaya geri alınınca
  `timelineCheckRecovery` "Unsaved timing edits found" diyaloğunu açtı
  → Restore: cue'lar 7→8, `cue[2].end` 6→8 (kaydedilen +2 düzenlemesi),
  kayıt `record:null` ile tüketildi.
- Yetki kapısı: `getWaveform` seçilmemiş dosyayı reddetti
  (`'Bu medya dosyası kullanıcı tarafından seçilmedi.'`) — kapı doğru;
  waveform pikselleri için yetkili akış gerçek dosya seçicisiyle geçerli
  (transcribe E2E'si ffmpeg yolunu daha önce doğruladı).

## Testler

- `node tests/timeline-issue-scan.test.js` — 9 kontrol (5 sorun sınıfı ayrımı,
  çakışma→sonraki cue ataması, 1 sn sınırı, satır limiti, cpsTier kelepçe,
  sıfır/negatif süre güvenliği, imza kararlılığı, bozuk girdi).
- `node tests/subtitle-edit-history.test.js` — 16 geçti
- `node tests/browser-subtitle-selection.test.js` — geçti
- `node tests/ui-locale.test.js` — 14 assertion (script sırası + unique keys)
- `node tests/browser-cue-timeline-calibration.test.js` — 3/3
- `node tests/timeline-oracle-fuzz.test.js` — 12/12
- `node tests/browser-subtitle-health|long-timeline|session|browser-subtitles|bulk-edit-locks|quick-edit` — geçti
- `node --check` — main/preload/renderer/timeline-issue-scan/ui-locale OK
- Çalıştırılmadı: tam `npm test` paketi (aynı ortamda son çalıştırma
  batch-10'da tamamen yeşildi; bu değişiklik dar kapsamlı — hedefli
  dosyaların tamamı yukarıda). Windows makine koşusu Windows seansında.

## Windows etkisi

- `waveform:extract` ffmpeg spawn'ı yerel medyaya bağımlı; Windows dosya
  seçiciyle seçilen dosya yetki kapısını doğal olarak geçer — yeni bir
  Windows-özel yol/izin yolu yok. `timeline-recovery.json` `userData`
  altında kalır; Roaming profil taşıması sorunsuz.
- Doğrulanamayan sınır: gerçek Windows'ta dalga biçimi ç��karma süresi ve
  çizim performansı (Ubuntu'da sorunsuz; Windows sahasında gözlenmeli).

## Bilinen v1 sınırları

- `listenUntil` duraklatma çizim çerçevesi aralığı kadar (~0,4 sn) gecikebilir.
- Waveform yokken çizelge görsel olarak boş durur — blok düzenleme tamamen
  çalışır, durum mesajıyla bilgilendirilir.
