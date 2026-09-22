# Tam Kapsam Code Review — 2026-09-20

**Review edilen birim:** `bee53b8`..`f90a5b4` arasındaki review-edilmemiş ürün commit'leri —
`de3f835` (R86-01..05 + R85-kuyruk doğrulama düzeltmeleri, 34 dosya / +1363/-144),
`44e6b42` (yalnız test), `fc42b40`+`2b67ea3` (SmartTube süreklilik — ayrı review'de F1–F5 bulguları),
`f85b1e7`/`6e75e03`/`f90a5b4` (docs).

Daha eski ürün commit'leri (`bee53b8` R85 uygulaması, `801e75f`, `59174a7`, `49715fb`, `7d1092f`)
kendi devir doğrulamalarından geçti ve R87'de bulgu-bazlı satır doğrulandı — ayrı review kapsamı dışında.

## Özet

**Karar: Request Changes** — 1 Major (SmartTube F1, önceki review'den), 6 Minor, 5 Nitpick.
Mimari ve güvenlik duruşu sağlam; atomik-yazım politikası ve yarış korumaları doğru kurulmuş.
Blocker yok.

## Gereksinim kontrolü

### R86 sözleşmeleri (de3f835)
- ✅ R86-01: `{{VIDEO}}/<sha256>` takma kimliği manifest'te; mutlak yol/kullanıcı dizini/sürücü
  yazılmaz (`workspace-package.js` `externalAliases` katalog değerlerini de çevirir);
  eksik video sessiz bağlanmaz — `missing` listesi JS'e döner, `videoMappings` yalnız gerçekten
  çıkarılanları eşler, `data.missingVideos` relink için yüzeylenir. Eski mutlak-yol paketleri
  aynen eşleşir (geriye uyumlu).
- ✅ R86-02: koruma kümesi prune'dan **önce** toplanır; `pruneTracks({keep})` + `sweepOrphans`
  aynı kümeyi paylaşır (`browser-asset-gc.js`). Keep/asset_path karşılaştırması iki uçta da
  lowercase.
- ✅ R86-03: ayna önce-yazılır politikası tüm yollarda tutarlı — `writeMirroredJsonAtomic`
  (places/prefs), `browser-session-store` (temp→.bak önce), `BrowserNoteStore.flush`
  (aynı desen), `saveHistory` (yerel writeJsonAtomic ile aynı sıra). API'ler sahte başarı
  dönmüyor (`history:remove/clear` hata raporluyor). Watch-library `atomicCommit` kasıtlı
  farklı politika: .bak = **önceki nesil undo noktası** (ayna değil) — fsync'li ve fault-hook'lu,
  testler kapsıyor.
- ✅ R86-04: tavan sonrası `lastEmitAt` tabanı; emits<5 geçidi + ≥cap-süresi koşulu — sel bitti,
  reset yolları iki sayacı da sıfırlıyor, stall/black-frame bağımsız.
- ✅ R86-05: açık çekim listesi — negatif matrisin hepsi set dışında (`tamamen`/`tamamla`/
  `tamamlamış`/`tamamlanmadı`/tek başına `tamam`), pozitifler yakalanıyor. `tamamı`-yalnız
  kalıbı bilinçli geniş — 'özet/konu/genel' tek kelimede de tetikler; belgelenmiş kabul.

### SmartTube kabul kapısı — önceki review'deki F1/F5 dışında ✅

## Bulgular

### F1 — Major · Bug · `renderer.js:22971`+`16460` (SmartTube review'den, hâlâ açık)
`stQueueToggle` `updatePlaylistButtons()` çağırmıyor; `setMediaKey` içindeki çağrı `mediaKey`
atamasından önce koşuyor → kuyruk/açılış geçişlerinde "Sonraki" düğmesi bayat `disabled`.
İki satırlık düzeltme (toggle sonunda çağrı + atama sonrası çağrı).

### F6 — Minor · Bug/UX · `main.js:1771-1779` (`youtube:cancel`)
Zaten ölmüş bir süreçte `proc.once('close')` hiç tetiklenmez → iptal isteği gereksiz 3 sn
bekler. `proc.exitCode !== null || proc.killed` ise beklemeyi atlamak yeterli.

### F7 — Minor · Bug · `playback-policy.js:34-40` (B83-04 düzeltmesinin bedeli)
`naturalAdvance`/cue-sonu penceresi 1→1.5 sn'ye açıldı → kullanıcının ≤1.5 sn'lik küçük
seek'leri "doğal ilerleme" sayılıp loopCue/autoPause/shadowing'le beklenmedik duraklama
üretebilir. Örnekleme-sınırı gerekçesi doğru; bedel bilinçli ama dar değil — 1.5 sn seek
sık bir kullanıcı eylemi. Süreğen takip gerekirse daraltılabilir (örn. tick kaynaklı mı
yoksa seek olayı mı ayrımı).

### F8 — Minor · Semantik · `main.js:15447` (`library:annotations:toggle`)
Kayıt yokken `saved: true, missing: true` dönmek ihtiyatlı (istemci "silindi" demesin) ama
mağazada kayıt gerçekten yoksa UI "kaydedilmiş" gösterir — bir sonraki toggle upsert ile
kendi kendine iyileşir. Alan adı/semantik netleştirilebilir; davranış kabul edilebilir.

### F9 — Minor · Perf · `browser-media-tools.js` `pythonServe`
Bir isteğin timeout/abort'u `killWorker` ile **tüm kuyruktaki kardeş istekleri** de düşürür
ve sıradaki isteğin timer'ı işlenme başlamadan tükenebilir (FIFO + girişte başlayan timer).
300 sn tavan ve ms-seviye sorgularla pratik risk düşük; belgeli tasarım. İyileştirme: timer'ı
kuyruk-pozisyonuna göre başlat veya abort'u tek isteğe indir (cevap-demeti gerekeceği için
düşük öncelik).

### F10 — Minor · Perf/Nit · `browser-subtitles.js:1914-1925` (PF1 hızlı yolu)
`needsClean` marker'sız metinlerde `cleanCueText` atlanır → yalnız boşluk/trim farkı olan
aynı mantıksal cue eski parmak iziyle farklı hash üretir → aynı oturumda iki sürüm yan yana
dedupe edilmez (seyrek ekstra republish). Oturum içi tutarlı — kalıcı anahtar değil — ama
`trim()` tek başına ucuz; hızlı yola `raw === raw.trim() && !/[ \t]{2,}/.test(raw)` koşulu
eklenebilir.

### F11 — Minor · Kozmetik · `browser-translation-cache.js:36-44` (B83-N3)
Arşiv budaması ada göre sıralar; `corrupt-<pid>-<ts>` adında pid önce geldiği için sıralama
yaklaşık kronolojik — sınır yine de uygulanır. `mtime`'a sıralamak daha doğru olur.

### F12 — Nitpick · Tasarım · `browser-link-hints.js:99-107` (B83-11)
`postMessage('*')` broadcast: herhangi bir frame (hostile iframe dahil)
`{__whisperLinkHintsCleanup:true}` gönderip ipuçlarını erken söndürebilir — yalnızca kendi
sayfasını bozar, veri sızıntısı yok. Kabul edilebilir; origin/marker doğrulaması istenirse
`event.source` window listesiyle sınırlandırılabilir.

### F13 — Nitpick · Ortam · `media-folders.js:10-13` + `.gitignore` `C:/`
POSIX'ta `path.win32.isAbsolute` kabulü, `path.join('C:\\x', ...)` ile cwd'de `C:` dizini
oluşturur (test artefaktı olarak .gitignore'a alındı). Ürün Windows hedefli; POSIX sızıntısı
yalnız test/fixture senaryosunda belirir. Uzun vadeli temizlik: win32 yolunu POSIX'te
kabul edip join'e sokmamak.

### F14 — Nitpick · Sağlamlık · `browser-media-tools.js` `ensureWorker`
Her işçi kurulumunda `process.once('exit', ...)` yeniden eklenir — respawn başına bir dinleyici
birikir (oturum boyu küçük); `once` tek seferde düşer ama ölü işçilerin closure'ları toplanır.
İsteğe bağlı: tek bir kalıcı exit dinleyicisi + `worker` referansı.

### F15 — Nitpick · Sağlamlık · `backend/browser_media_tools.py:99-112`
`serve()` satırı tamamen okuyup **sonra** 24 MB kontrolü yapıyor — dev tek satır bellekte
okunur (stdin pipe sınırlı; pratik risk düşük). `main()` yolu doğru şekilde sınırlı okur.

### SmartTube Minor/Nit'ler (önceki review, burada da geçerli)
F2 oto-next resume beslemiyor · F3 kafa-dışı oynatma kuyruğu korur (tekrar) · F4 50. kayıt
sessiz düşürülür · F5 raylar dequeue sonrası bayat görünür.

## Güvenlik

- Yeni saldırı yüzeyi yok: `serve()` yalnız yerel stdio; `postMessage` marker'ı tek yönlü
  komut (geri okuma yok); `resolveInside` win32 mutlak + `\` normalizasyonuyla traversal
  sertleşti.
- Manifest/video paketi artık makineye özgü mutlak yol taşımıyor (R86-01 hedefi karşılandı).
- `probeCommand` stderr drain + stdout 256 KiB sınırı — pipe kilitlenmesi ve sınırsız bellek
  büyümesi kapatıldı.
- Sekrete dair bir şey yok; hata mesajları iç detay sızdırmıyor (`missing` listesi dahili).

## Standartlar

- Türkçe yorum konvansiyonu korunuyor; iki dilli UI dizgileri eklendi.
- Yeni yardımcılar (`atomic-json`, `browser-asset-gc`) tek amaçlı ve enjekte edilebilir
  (`io`/`fsModule` parametreleri testi gerçekçi kılıyor).
- 695 satırlık `browser-report86-regressions.test.js` EACCES/rename/unlink matrisi, sanal
  saat backoff'u, niyet pozitif/negatif tablosu, CEA/EME sözleşmeleriyle tam — eşik gevşetme
  yok.
- Smoke sertleştirme doğru yönde: sabit sleep yerine piksel-stabilite + görünürlük predikatları;
  `--no-zygote`/`--no-sandbox`/`--disable-gpu` yalnız test çocuğunda, Linux'a koşullu.

## Pozitif gözlemler

- `.bak` politikasının 4 dosya deposunda tek desene indirgenmesi + injectable `io` ile
  gerçek hata-enjeksiyon testleri — bu turun en sağlam mimari parçası.
- `pruneReplacedBrowserPageBlocks` 7 ayrı session haritasını tek yerde temizliyor;
  exclusion yolunda iki bayatlık kapısı await sınırlarına doğru yerleştirilmiş.
- `loadRetryTimer` hem gezinme başında siliniyor hem nesil damgasıyla kendini iptal ediyor —
  çift emniyet.
- PF1 parmak izi hızlı yolu marker-tabanlı ve `\x00` ayraçlı — alan çakışması düşünülmüş.

## Öneriler

1. **Merge/teslim öncesi:** F1 (SmartTube) — iki satır.
2. **Önerilir:** F6 (ölü süreçte 3 sn), F7'nin bedelini gözlemek, F2/F3 SmartTube kararları.
3. **İsteğe bağlı:** F9–F15.

Doğrulama kanıtları (commit mesajı + bu oturum): report86 44/44, report67 72/72,
player-ui 145/145, design-system ✓, npm test tek hata = belgeli fts5 ortam sınırı,
4× ardışık Electron smoke 20/20.
