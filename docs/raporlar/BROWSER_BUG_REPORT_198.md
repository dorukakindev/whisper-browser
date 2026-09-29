# BROWSER BUG REPORT 198 — tur-4 paketi uygulama + doğrulama (R241)

Tarih: 2026-09-29 · Dal: `fix/r241-round4` → PR #181

## Kapsam

`whisper-browser-round4.zip` paketi değerlendirilip uygulandı. Paket 6 patch
(0001–0006) + bulgu listesi (BULGULAR.md) + test listesi (TESTS-FOR-DEVIN.md)
içeriyordu. Bundle'ın önkoşul commit'i (`b5a434a`) depoda yok; patch'ler
`git apply`/`git am` ile tek tek işlendi.

## Patch durumları

| Patch | Durum | Açıklama |
|---|---|---|
| 0001 test onarımları | atlandı | Aynı 4 test dosyası master'da R233/R237 düzeltmeleriyle zaten güncel ve yeşil; patch test tarafı bire bir çakışıyordu. |
| 0002 `tools/ui-smoke.mjs` | uygulandı | Menü duman testi aracı + `smoke:ui`/`audit:ui` npm betikleri + `tools/ui-smoke-allow.json` + CI workflow + CLAUDE.md kuralı. |
| 0003 backend altyazı | uygulandı | transcribe.py +183 satır, sentence_translation, invidious, pipeline_control, pipeline-job.js. |
| 0004 IPC güvenliği | uygulandı | main.js +95, workspace-package, core-security-r4.test.js. |
| 0005 UI küçük düzeltmeler | büyük ölçüde geçersiz | Avatar-monogramı, Ctrl+F tek köprü ve önizleme kırpılması R233/R238/R239/R240'da zaten daha kapsamlı çözüldü (bkz. aşağı). Tek yeni fikir `is-compact` kart varyantı — tasarım alternatifi olarak not edildi, uygulanmadı. |
| 0006 ui-locale perf | uygulandı | `localizeText` boşluk düğümlerini, `localizeElement` özniteliksiz öğeleri `closest()` öncesi eliyor; 8 satır. Testleri `tests/browser-ui-r4.test.js`'e taşındı (0005'in varsayımlarına bağlı olmayan kısım). |

### 0005 detay karşılaştırması

- **Avatar**: paket `siteMonogramLabel` (browser-address-model) öneriyor; bizim
  `browserAvatarDomainKey` (renderer.js) aynı işi yapıyor **üstelik** IP
  indirgeme koruması, adres-önerisi işareti ve bayat-avatar kilidi içeriyor.
  Fonksiyonel eşdeğer → korundu.
- **Ctrl+F**: paket köprüde `key==='f'` erken dönüşü öneriyor; R233'te bul
  çubuğu tek kapılı `find-open` yoluna indirildi — aynı sonuç, farklı mekanizma.
- **Önizleme**: paket sığmayan kartı `is-compact` tek satıra düşürüp yine
  sığmazsa OS tooltip'ine bırakıyor; bizim çözüm `maxHeight`+`overflow:hidden`
  ile kartı keser. `is-compact` fikri rapora notlandı (tasarım turu konusu).
- Paketin `browser-ui-r4.test.js` dosyasındaki avatar/Ctrl+F/önizleme
  assertion'ları **kendi** uygulamalarını test ediyor; bize uymayan kısımlar
  atılıp yalnız ui-locale performans assertion'ları alındı.

## Uygulanan değişiklikler (yüksek sinyal)

**Backend (0003):**
- Boş satırlı cue / sıfır-süreli cue tüm işi çökertmiyor (API maliyeti sonrası
  yazım hatası).
- VTT `NOTE` blokları çeviriye gönderilmiyor; VTT yazıcısı `}`/`-->` kaçışlıyor.
- `{\an8}` gibi ASS konum etiketleri birleşen cümlelerde sızıyordu → temizleniyor.
- Örtüşen çift-SRT kaynak cue'ları çift yazılmıyor; `write_json` kelime sınırı
  kopyası iki segmente taşmıyor.
- "2. Dünya Savaşı" gibi sıra sayılarında nokta sonrası satır sonu yok
  (`set_target_language` + `_ORDINAL_TARGET_LANGS` — tr/de/…).
- Dengeli sarma 4 satırlı cue ve "Mr." kısaltması sonrası kırma düzeltmeleri.
- `clean_text` artık `<3` kalbi soymuyor.
- Çıktı işlem kurtarması `staging` durumunda kullanıcının aynı adlı dosyasını
  silmiyor (`pipeline_control.recover_output_transactions` + JS eşleniği) +
  `rollback_open_output_transactions()` ile başarısız işte .tmp/journal temizliği.
- ffmpeg/ffprobe çocuklarına gizli env değişkenleri miras kalmıyor.

**IPC güvenliği (0004):**
- Invidious dil kodu `..\..\x` traversal reddi + çıktı yolu klasör sınırı.
- `history:authorizeFiles` — içe aktarılan paket kayıtları `imported` işaretli;
  `\\sunucu\paylaşım` yollarına dokunma NTLM sızıntısı kesildi.
- Sayfa çevirisi blok üst sınırı (20k); mailto açma 1/3sn'ye tıklandı.
- Favicon getirme yalnız public host + redirect yok (SSRF).
- `-` ile başlayan argüman değerleri `--opt=val` biçiminde geçiyor.

**Araçlar (0002):** `tools/ui-smoke.mjs` — her menü öğesini tıklayıp görünür
etki ölçen smoke; `tools/ui-smoke-allow.json` izin listesi; CI'a smoke/audit
adımları; CLAUDE.md'ye kalıcı kural.

**Perf (0006):** ui-locale açılış taraması ~3.700 öğede gereksiz `closest()`
eşleşmesini atlıyor (paket ölçümü: TR 73→47 ms, EN 97→55 ms).

## Doğrulama (TESTS-FOR-DEVIN §1–§3)

- `npm test`: **tamamen yeşil** — `tests/browser-ui-r4.test.js` ✓,
  `tests/core-security-r4.test.js` 8 kontrol ✓,
  `backend/test_core_regressions_r4.py` 15 test ✓ (paketteki 8 kırmızı
  senaryo dahil).
- `npm run audit:ui -- --strict --browser chrome`: **0 kontrast hatası**
  (tüm senaryolar × tema × dil × genişlik).
- `npm run smoke:ui -- --strict --browser chrome`: **79 tıklama, 0 bulgu**
  (`tmp/ui-smoke/report.json`).
- `npm run test:electron-bridge`: geçti.
- `node tests/run-electron-smokes.js --all`: 3 smoke düştü —
  `menu-formcontrols` (range odak), `menu-visual` (desktopCapturer),
  `split-shortcut` (bölünmüş görünüm zaman aşımı). **Üçü de değişmemiş
  master worktree'de aynen düşüyor** → başsız-ortam sınırı, tur-4
  regresyonu değil. Özellikle vurgulanan `electron-browser-find` PASS
  (`"1 / 3 → 2 / 3 → 1 / 3 → kapandı"`).

## Açık kalanlar

- BULGULAR'ın bilinçli açık bıraktıkları: altyazı indirmede DNS rebinding,
  `normalize_timings` ~10ms cue, `whisper-assets://` parmak izi.
- §4'teki 14 maddelik elle kontrol listesi Windows doğrulama oturumuna
  iletildi (devin-3c20a465).
- `is-compact` önizleme kartı tasarımı — kullanıcı tercihi gerektiren tasarım.
