# Rapor463 — Kod değiştirmeyen 50 görevlik derin hata taraması

**Tarih:** 2026-10-18
**Depo:** https://github.com/dorukakindev/whisper-browser
**Dal:** `codex/browser-whisper-progress-20261014`
**Başlangıç ve bitiş ürün-kodu commit:** `0e0193a16eed0d9cddd7ba2748b60abdfd2e14fd` (aynı)
**Ürün kodu değişikliği:** YOK. `git diff` boş; yalnız bu rapor ve devir/dizin belgeleri eklendi.

## Yönetici özeti

- `npm test` tam paket: **549 test dosyası** (478 Node + 71 Python) çalıştı; **1 dosya kırmızı**:
  `tests/subtitle-sentence-layout.test.js` — `Zero duration` fixture'ı. Diğer 548 dosya geçti.
- Ek dinamik koşular: Electron güvenilir köprü smoke **geçti**; UI smoke **81 tıklama / 0 bulgu**;
  UI kontrast denetimi **kırmızı** (16 ihlal, hepsi `player-mode` + light tema + 1400 px).
- Sözdizimi: 195 JS (vendor hariç) + 94 Python dosyası, **0 hata**.
- Bu turda **16 bulgu** raporlandı: 4 yüksek, 1 orta-yüksek, 5 orta, 2 düşük-orta, 4 düşük.
  Bunlardan 12'si çalıştırmayla (komut/fixture) doğrulandı; 4'ü yüksek güvenli statik kanıttır.
- En önemli üç başlık: (1) sıfır süreli cue'ların çeviri/asset hattından sessizce düşmesi ve test
  sözleşmesinin çelişmesi, (2) ayar içe aktarımında eski API anahtarının yeni endpoint'e taşınması,
  (3) tireli diyalog repliklerinin `ozel_ad_kaydi` kapısına takılması.

## Yöntem ve 50 görev

| # | Görev | Sonuç |
|---|---|---|
| 1 | Repo, dal, HEAD, kirli çalışma ağacı anlık görüntüsü | Tamam; ürün kodunda diff yok |
| 2 | Test envanteri (Node/Python, 549 dosya) | Tamam |
| 3 | Tüm JS/Python sözdizimi kontrolü | 195 JS + 94 PY, 0 hata |
| 4 | `npm test` tam paket taban çizgisi | 1 dosya kırmızı |
| 5 | Python testlerinin tamamı | 71 dosya geçti |
| 6 | Electron trusted-bridge smoke | Geçti |
| 7 | Headless UI smoke (tüm menü/araç çubuğu) | 81 tıklama, 0 bulgu |
| 8 | UI kontrast matrisi (tema × dil × genişlik) | 16 ihlal (player-mode/light) |
| 9 | Kırmızı testin triyajı | 463-01 |
| 10 | `parse_timecode`, SRT/VTT saat biçimleri, negatif/NaN | Temiz |
| 11 | `--clip-start/--clip-end` ve `time_offset` | Mevcut testler geçti; yeni sapma yok |
| 12 | Bölme/sarma fonksiyonları | Temiz; CJK sarma 463-13 |
| 13 | `merge_short_entries` / `merge_incomplete_sentences` / `merge_continuation_lines` | 463-05 |
| 14 | Halüsinasyon ve tekrar filtreleri | Temiz (30 gerçekçi replik + mevcut testler) |
| 15 | Tireli diyalogda özel ad kapısı | 463-03 |
| 16 | 12 saat → 24 saat saat çevirisi | 463-04 |
| 17 | `part_repetition_issue` | 463-11 |
| 18 | Birim/sıcaklık işaretleri | 463-14 |
| 19 | Yalnız-çeviri + aynı dil | 463-06 |
| 20 | Kısa Türkçe dosyada aynı-dil kapısı | 463-07 |
| 21 | CJK/Tayca satır sarma | 463-13 |
| 22 | `OutputTransaction`, iptal, kurtarma | Temiz (statik + mevcut testler) |
| 23 | Re-export ve translate-only | 463-06/07 dışında temiz |
| 24 | Çeviri önbellek anahtarı v6 | Çakışma bulunmadı |
| 25 | `media.py` indirme geçici dosyaları | 463-16 |
| 26 | 245 `ipcMain` handler ve yetki kapıları | Yetkisiz handler bulunmadı |
| 27 | Yol yetkilendirme / traversal / `\\?\` | Temiz |
| 28 | Gizli anahtar argv/env/log zinciri | Temiz |
| 29 | Ayar içe aktarımı ve kasa anahtarları | 463-02 |
| 30 | Ayar dışa aktarımı redaksiyonu | Temiz |
| 31 | JSON transaction ve fsync | 463-15 |
| 32 | Kuyruk/geçmiş `.bak` dayanıklılığı | 463-12 |
| 33 | Kuyruk/job terminal mandalı | Temiz |
| 34 | Burn-in başlatma kilidi | 463-10 |
| 35 | Dış altyazı değişiklik izleyicisi | 463-09 |
| 36 | Klasör izleme (watch folder) | Temiz |
| 37 | Renderer olay kapısı / `awaitingExit` | Temiz (mevcut testler) |
| 38 | Kuyruk yaşam döngüsü / jobId / opts dondurma | Temiz (mevcut testler) |
| 39 | Oynatıcı kaynak değişimi / generation | Temiz (mevcut testler) |
| 40 | Altyazı düzenleme ve biçim koruma | Temiz (mevcut testler) |
| 41 | Timeline işaretleri / overlay | Temiz (mevcut testler) |
| 42 | Erişilebilirlik, odak, klavye | Temiz (smoke + testler) |
| 43 | EN/TR i18n kapsamı | Temiz (`i18n-coverage` geçti) |
| 44 | XSS sink'leri / innerHTML ratchet | Temiz (ratchet testleri geçti) |
| 45 | CSP ve gezinme politikası | Temiz (testler geçti) |
| 46 | SmartTube TV açık tema görünürlüğü | 463-08 |
| 47 | Tarayıcı gezinme/SSRF/şema kapıları | Temiz |
| 48 | Tarayıcı altyazı normalize/merge | 463-01 |
| 49 | Çeviri zamanlayıcı/önbellek | 463-01/11 dışında temiz |
| 50 | Oturum/gizlilik/store'lar ve nihai doğrulama | Temiz; `git diff` boş |

## A. Test ve doğrulama sonuçları

### A.1 `npm test` (tam paket)

```
549 test dosyası: 478 Node + 67 backend/test_*.py + 4 tests/test_*.py
1 test dosyası BAŞARISIZ
```

Kırmızı dosya: `tests/subtitle-sentence-layout.test.js`.
İlk hata: `AssertionError [ERR_ASSERTION]: Zero duration`, `tests/subtitle-sentence-layout.test.js:94`.
Bu test tek başına ikinci kez de aynı hatayla düştü; ortam kaynaklı değil.

### A.2 Ek koşular

| Komut | Sonuç |
|---|---|
| `npm run test:electron-bridge` | Geçti |
| `node tools/ui-smoke.mjs --strict` | 81 tıklama, 0 bulgu |
| `node tools/audit-ui.mjs --strict` | Exit 1; 52 yüzeyde 16 kontrast ihlali (TR 8 + EN 8) |
| `node --check` (195 JS) | 0 hata |
| `python -m py_compile` (94 PY) | 0 hata |

UI kontrast denetimi dışında kalan tüm Node ve Python testleri geçti. Electron smoke
envanterinin tamamı (`tests/run-electron-smokes.js`, ~60 dosya) bu turda koşulmadı.

### A.3 Hedefli probe'lar

- `assembleCueSentences` + sıfır süreli cue → metin kaybı (463-01).
- `part_anchor_issue` ile 12 tireli replik → 12/12 red (463-03).
- `part_anchor_issue` / `translation_meaning_issues` ile 12 saat → 24 saat (463-04).
- `merge_short_entries` ile farklı konuşmacı tire repliği (463-05).
- `transcribe.py --translate-only` ile aynı dil (463-06) ve 2 cue'luk `.tr.srt` (463-07).
- cp1254 baytları: `decodeSubtitleBuffer` doğru, `readFileSync(..., 'utf-8')` bozuk (463-09).
- `sanitizeSettings` + `mergeSettingsSecrets` ile endpoint değişimi (463-02).

## B. Bulgular

### 463-01 — [YÜKSEK] Sıfır süreli cue'lar sessizce düşüyor; test sözleşmesi çelişiyor

**Konum:** `src/browser-translation-scheduler.js:23-24`, `src/browser-asset-store.js:45-46`,
`tests/fixtures/sentence-groups.json:11`, `tests/subtitle-sentence-layout.test.js:94`,
`tests/report456-regressions.test.js:49-53`.

**Ne oluyor:** `normalizeCues` filtresi `end >= start` yerine
`Math.round(end*1000) > Math.round(start*1000)` kullanıyor. Bu, 0 ms ve 1 ms altı cue'ları
tamamen atıyor. `assembleCueSentences` bu cue'ları görmediği için metinleri çeviriye hiç
gitmiyor; asset store da aynı cue'ları kanonik JSON'dan düşürüyor.

**Kanıt:**

```text
node -e "const {assembleCueSentences}=require('./src/browser-translation-scheduler');
const input=[{id:'0',start:0,end:1,text:'a'},{id:'1',start:1,end:1,text:'b'},
{id:'2',start:1,end:2,text:'c.'}];
console.log(JSON.stringify(assembleCueSentences(input).map(x=>({ids:x.cueIds,text:x.text}))));"

[{"ids":["0","2"],"text":"a c."}]
```

`b` cue'u ve metni kayboldu. `npm test` de aynı fixture'da `[[0],[1],[2]]` beklerken
`[[0,2]]` aldığı için kırmızı. Buna karşılık `report456-regressions.test.js` aynı davranışı
“sıfır ms cue çeviri planına girmemeli” diye açıkça doğruluyor. Yani iki test farklı
sözleşmeleri savunuyor.

**Etki:** Canlı altyazıda aynı zaman damgasına düşen replikler çeviri çıktısından ve
yeniden açılan asset'ten kaybolur; CI sürekli kırmızıdır. Hangi davranışın doğru olduğu
ürün kararıdır; mevcut hâli iki tarafı da memnun etmiyor.

**Öneri (uygulanmadı):** Ya süreyi onar (browser-subtitles'daki gibi `end = start + 0.08`)
ve fixture'ı koru, ya da düşürmeyi bilinçli kabul edip eski fixture'ı güncelle ve düşen
metni en azından uyarı olarak raporla.

### 463-02 — [YÜKSEK] Ayar içe aktarımı eski API anahtarını yeni endpoint'e taşıyor

**Konum:** `src/settings-security.js:331-338`, `src/secret-store.js:90-98`,
`src/main.js:19778` (diyalog iddiası), `src/main.js:19795-19799`, `src/main.js:19858`,
`src/main.js:6375` (`browserTranslationConfig`).

**Ne oluyor:** İçe aktarılan yedek endpoint'i değiştirdiğinde `sanitizeSettings`
`secretsInheritable=false` ile anahtarı doğru şekilde dışarıda bırakıyor. Ancak yazılan
ayar dosyasında `clearedSecretFields` yok. `loadSettings()` daha sonra
`mergeSettingsSecrets` ile kasadaki eski `translate.apiKey` değerini yeni endpoint'in
yanına geri koyuyor ve `browserTranslationConfig` bu anahtarı yeni adrese gönderiyor.

**Kanıt:**

```text
node - <<'NODE'
const s = require('./src/settings-security');
const { mergeSettingsSecrets } = require('./src/secret-store');
const existing = { translate: { endpointPreset: 'https://api.openai.com/v1', apiKey: 'sk-OLD-KEY' } };
const imported = { translate: { endpointPreset: 'custom',
  customBaseUrl: 'https://attacker.example/v1' } };
const clean = s.sanitizeSettings(imported, { allowSecrets: false, existingSettings: existing });
console.log('sanitized:', JSON.stringify(clean.translate));
console.log('after load:', JSON.stringify(mergeSettingsSecrets(clean,
  { 'translate.apiKey': 'sk-OLD-KEY' }).translate));
NODE
sanitized: {"endpointPreset":"custom","customBaseUrl":"https://attacker.example/v1"}
after load: {"endpointPreset":"custom","customBaseUrl":"https://attacker.example/v1","apiKey":"sk-OLD-KEY"}
```

**Etki:** Kullanıcı kötü niyetli veya yanlış bir yedeği içe aktardığında, arayüz
“mevcut API anahtarları yeni endpoint'e taşınmadı” demesine rağmen anahtar sessizce
saldırganın/üçüncü tarafın endpoint'ine gönderilir. Aynı durum meşru sağlayıcı
değişiminde de anahtarın yanlış sağlayıcıya gitmesine yol açar. `manga` ve `llm`
gruplarında da aynı birleştirme yolu vardır.

**Öneri (uygulanmadı):** Endpoint kimliği değişen her gizli alan için
`clearedSecretFields` yaz; `withSecrets` yalnız aynı endpoint kimliğine sahip kasa
alanlarını geri koysun.

### 463-03 — [YÜKSEK] Tireli diyalog replikleri `ozel_ad_kaydi` kapısına takılıyor

**Konum:** `backend/sentence_translation.py:267` (`_LEADING_MARKERS`), `:474-483`
(`_proper_names`), `:503`; çağrı yolu `backend/transcribe.py:4087-4096`.

**Ne oluyor:** Tire (`-`, `–`, `—`) `_LEADING_MARKERS` içinde olmadığı için `words[0]`
tire oluyor; gerçek ilk sözcük `index=1` ile “cümle başı” sayılmıyor ve özel ad
sanılıyor. Kapı her grupta, tek cue'luk gruplar dahil çalışıyor.

**Kanıt:** 12 gerçekçi replik denendi; 12'si de reddedildi:

```text
("- Don't move!", "- Kımıldama!") -> ozel_ad_kaydi:0
("- Wait for me!", "- Beni bekle!") -> ozel_ad_kaydi:0
("— Don't move!", "— Kımıldama!") -> ozel_ad_kaydi:0
Tire yoksa: ("Don't move!", "Kımıldama!") -> ""
```

**Etki:** Altyazıda konuşmacı tiresi kullanan her replik çeviri kapısından dönüyor;
yeniden deneme maliyeti çıkıyor, sonunda satır kaynak dilde kalıyor ve iş `.partial`
sayılıyor. Proje belgeleri tireyi korumayı açıkça vaat ediyor.

**Öneri (uygulanmadı):** `_LEADING_MARKERS` içine tireyi ekle veya `_proper_names`
hesabından önce tire token'ını atla.

### 463-04 — [YÜKSEK] 12 saat → 24 saat çevirisi sayı kaybı sanılıyor

**Konum:** `backend/sentence_translation.py:753-765`, `:1269-1286`, engel listesi
`:1355-1359`.

**Ne oluyor:** `5:30 p.m.` → `17.30` dönüşümü, saat eşleştiricisinin yalnız birebir
`5.30` veya Türkçe sözcük biçimini kabul etmesi yüzünden `number_mismatch` ve
`sayi_kaydi:0` üretiyor.

**Kanıt:**

```text
"Call me at 5:30 p.m. tomorrow." -> "Yarın 17.30'da beni ara."
  part_anchor_issue: sayi_kaydi:0
  translation_meaning_issues: ['number_mismatch']
"Call me at 5:30 tomorrow." -> "Yarın 5.30'da beni ara."  # geçiyor
```

**Etki:** Türkçede/ABD dışı saat gösteriminde doğru çeviri reddediliyor; diyalogda saat
geçen sahnelerde satır kaynak dilde kalabiliyor ve gereksiz yeniden deneme yapılıyor.

### 463-05 — [ORTA-YÜKSEK] `merge_short_entries` farklı konuşmacının tire repliğini yutuyor

**Konum:** `backend/transcribe.py:5742-5768`.

**Ne oluyor:** Kısa “flash” bloğu, önceki cümle bitmiş olsa bile birleştiriliyor; diğer
iki birleştiriciden farklı olarak `DIALOG_STARTS` koruması yok.

**Kanıt:**

```text
[(0.0, 2.0, "I told you to wait."), (2.1, 2.6, "- No.")]
-> [(0.0, 2.6, "I told you to wait. - No.")]

[(0.0, 2.0, "Nereye gidiyorsun?"), (2.1, 2.6, "- Eve.")]
-> [(0.0, 2.6, "Nereye gidiyorsun? - Eve.")]
```

**Etki:** İki konuşmacı tek cue'da birleşiyor; diarization ve çeviri için “bir satır = bir
konuşmacı” varsayımı bozuluyor. Hızlı diyalogda çok yaygın.

**Öneri (uygulanmadı):** `merge_short_entries` içinde de `txt.startswith(DIALOG_STARTS)`
ve `prev[2].startswith(DIALOG_STARTS)` kontrolü kullan.

### 463-06 — [ORTA] Aynı-dil yalnız-çeviri işi sahte `.partial` ve 0 başarı üretiyor

**Konum:** `backend/transcribe.py:8703-8720`, `:8773-8781`, `:8821`.

**Ne oluyor:** `same_language` dalı `completed` ve `skipped` yazıyor ama `unchanged`
yazmıyor. Kalite raporu kaynakla birebir aynı metinleri “çevrilmemiş” sayıyor;
`quality_failed_indices` temizlenmediği için `completed=0`, `failed=N` ve
`*.partial.srt` üretiliyor.

**Kanıt (geçici dizinde, gerçek `main()`):**

```text
2 blokluk film.en.srt, --translate-only true --language en --translate-to en
-> film.en.partial.srt + film.en.partial.srt.meta.json
-> done.outputs[0].status="partial", completed=0, failed=2
-> uyarı: "Ceviri kalite kontrolu: 2 kaynak metinli cue, 0 bos..."
```

**Etki:** Kullanıcı “zaten hedef dilde” işi için başarısızlık ve yarım dosya görüyor;
gereksiz kurtarma dosyası ve yanlış uyarı oluşuyor.

**Öneri (uygulanmadı):** Aynı-dil dalında `translation_status["unchanged"]` doldur veya
`skipped` indekslerini `quality_failed_indices` hesabından çıkar.

### 463-07 — [ORTA] 1–2 cue'luk Türkçe dosya aynı-dil kapısını atlıyor

**Konum:** `backend/transcribe.py:3745-3759`, kullanım `:8655-8657`.

**Ne oluyor:** `file_looks_turkish` en az 3 satır istiyor; dosya adındaki `.tr` eki bu
kapıda kullanılmıyor. 2 cue'luk Türkçe altyazı `--language auto --translate-to tr`
altında çeviriye gönderiliyor.

**Kanıt:**

```text
file_looks_turkish(2 Türkçe cue) -> False
file_looks_turkish(3 Türkçe cue) -> True

2 cue'luk film.tr.srt, --language auto --translate-to tr:
-> "Ceviriliyor: Turkce"
-> "Ceviri ATLANDI: API anahtari bos"
-> exit 1, "Eksik altyazı blokları çevrilemedi..."
```

**Etki:** Kısa tanıtım/kliplerde anahtar yoksa yanıltıcı hata; anahtar varsa gereksiz
ücretli istek. Tam olarak bu kapının önlemek istediği durum.

### 463-08 — [ORTA] SmartTube TV açık temada okunamıyor (16 kontrast ihlali)

**Konum:** `src/renderer/styles.css:7109-7127`, `:3046`, `:3156`, `:3168`;
`src/renderer/browser-chrome.css:1649-1659`.

**Ne oluyor:** `.smarttube-browser.st-tv` `--text`, `--bg-2`, `--bg-3` gibi token'ları
koyu TV paletine çeviriyor; ancak `--bg-1` ve `--accent-soft` çevrilmiyor. `.st-home-intro`
`--bg-1` (açık temada `#f7f4ed`), ilk eylem düğmesi `--accent-soft` (açık tema
`rgba(169,104,32,.13)`) kullanıyor; metin ise beyaz kalıyor.

**Kanıt:** `node tools/audit-ui.mjs --strict` → exit 1, 52 yüzeyde 16 ihlal
(`player-mode`, light, TR+EN, 1400 px):

| Seçici | Metin | Ölçülen | Gerekli |
|---|---|---:|---:|
| `span.st-brand-name` | YouTube | 1.00 | 3.0 |
| `button#stYoutubeAccounts` | Hesaplar | 1.00 | 4.5 |
| `span.st-home-kicker` | İZLEME ALANI | 1.57 | 4.5 |
| `h2#stHomeTitle` | İzlemeye başla | 1.00 | 3.0 |
| `.st-home-copy p` | Bir video aç… | 1.86 | 4.5 |
| `.st-home-actions strong` | Video aç | 1.17 | 4.5 |
| `.st-home-actions span` | Bilgisayarındaki… | 1.59 | 4.5 |
| `.st-home-fallback div` | Akış alınamadı… | 1.86 | 4.5 |

**Etki:** Açık temada TV/oynatıcı ana sayfasındaki başlık ve düğme metinleri görünmez;
ekran görüntüsünde başlık tamamen kayıp. Aynı hata 1400 px'te TR ve EN'de tekrarlıyor.

**Öneri (uygulanmadı):** `.st-tv` içinde `--bg-1`, `--accent-soft` (ve kullanılan diğer
açık token'lar) koyu TV karşılıklarına bağlanmalı.

### 463-09 — [ORTA] Dış altyazı değişikliği ham UTF-8 okunuyor; cp1254 bozuluyor

**Konum:** `src/main.js:2551` (`notifySubtitleFileChanged`), karşılaştırma
`src/main.js:2509` ve `:20218` (`decodeSubtitleBuffer`).

**Ne oluyor:** Dosya izleyicisi içeriği `fs.readFileSync(fullPath, 'utf-8')` ile okuyor;
diğer tüm okuma yolları `decodeSubtitleBuffer` (utf-8-sig → cp1254 → latin-1 + onarım)
kullanıyor. cp1254 Türkçe altyazıda ş/ğ/ı karakterleri U+FFFD'ye dönüşüyor; renderer
`applyExternalSubtitleContent` ile bunu `player.subRaw`/`cuesRaw`'a yazıyor.

**Kanıt:**

```text
cp1254 baytları: "Türkçe ğış"
decodeSubtitleBuffer -> "Türkçe ğış"
readFileSync(..., 'utf-8') -> "T[U+FFFD]rk[U+FFFD]e [U+FFFD][U+FFFD][U+FFFD]"
```

**Etki:** Kullanıcı eski kodlamalı altyazıyı başka editörde düzeltip kaydettiğinde
oynatıcı mojibake gösterir; sonraki cue düzenlemesi bu bozuk metni diske geri yazabilir.

### 463-10 — [ORTA] `burnin:start` kilidi ilk await'ten sonra alınıyor; çift başlatma yarışı

**Konum:** `src/main.js:20441-20496` (özellikle 20443, 20448-20449, 20488-20496),
`src/renderer/renderer.js:6028-6034`.

**Ne oluyor:** Yorum “ilk await öncesi kilidi al” diyor; kod `burninStartPending = true`
satırını iki yetkilendirme, disk kontrolü ve `stageBurninSubtitle` await'lerinden SONRA
(20489) çalıştırıyor. İki hızlı IPC çağrısı da kapıyı geçip aynı `tempPath`/`outPath`
üzerinde iki ffmpeg başlatabilir; `burninJob` ikincisiyle ezilir. Renderer düğmeyi
`await` öncesi devre dışı bırakmıyor.

**Etki:** Çift tıklamada iki gömme süreci, yarım kalan/orphan iş, aynı recovery
dosyasının ezilmesi. `transcribe:start` ile de yarışabilir (burn-in kapısı `jobStarting`'i
kontrol etmiyor).

**Öneri (uygulanmadı):** Kilidi fonksiyonun en başında, ilk await'ten önce al; hata
yollarında `finally` ile bırak; renderer'da düğmeyi istek öncesi kilitle.

### 463-11 — [ORTA-DÜŞÜK] `part_repetition_issue` farklı kaynakların aynı doğru çevirisini reddediyor

**Konum:** `backend/sentence_translation.py:237-253`.

**Ne oluyor:** Farklı kaynak parçalar aynı hedef metne çevrildiğinde “tembel tekrar”
sayılıyor. Aynı kaynak metnin tekrarı ayrıca ele alındığı için yalnız farklı kaynak +
aynı doğru çeviri cezalandırılıyor.

**Kanıt:**

```text
(["I don't know.", "I have no idea."], ["Bilmiyorum.", "Bilmiyorum."]) -> tekrarli_part:1
(["Yeah.", "Yes."], ["Evet.", "Evet."]) -> tekrarli_part:1
(["No.", "No."], ["Hayır.", "Hayır."]) -> ""   # aynı kaynak korunuyor
```

**Etki:** Noktalama içermeyen canlı altyazıda iki kısa replik aynı gruba düşerse doğru
çeviri reddedilebilir. Gerçek gruplama sıklığı düşüktür; bu yüzden orta-düşük.

### 463-12 — [DÜŞÜK-ORTA] Bozuk birincil kuyruk/geçmiş dosyası sağlam `.bak`'ı eziyor

**Konum:** `src/main.js:2880-2908` (`writeQueueState`), `:3351-3360` (`saveHistory`).

**Ne oluyor:** `readQueueStateRaw` bozuk birincil yerine `.bak`'ı okuyabiliyor; ancak
sonraki yazma önce bozuk birincili `.bak`'a kopyalıyor, sonra yeni dosyayı yazıyor.
Yazma başarısız olursa (disk dolu/AV kilidi) iki kopya da bozulur; başarılı olsa bile
son sağlam yedek kaybolur.

**Etki:** Kuyruk/geçmişte çift bozulma penceresi. Düşük olasılıklı ama veri kaybı
sonuçlu.

### 463-13 — [DÜŞÜK] CJK/Tayca satır sarma `max_line_width`'i yok sayıyor

**Konum:** `backend/transcribe.py:638-758` (`wrap_text`).

**Kanıt:**

```text
wrap_text("这是一个测试句子" * 10, 20, 2, language="zh")
-> tek satır, 80 karakter
wrap_text("これは日本語のテストです。" * 5, 20, 2, language="ja")
-> tek satır, 75 karakter
```

**Etki:** Çince/Japonca/Tayca altyazıda satır genişliği sınırı uygulanmıyor; oynatıcıda
taşma/kesilme. Düşük çünkü boşluksuz yazıda sarma politikası ürün kararı olabilir.

### 463-14 — [DÜŞÜK] “30 derece santigrat” birim kapısına takılıyor

**Konum:** `backend/sentence_translation.py:1088-1104` (`_unit_markers`).

```text
"It is 30 degrees Celsius." -> "30 derece santigrat."
  part_anchor_issue: unit_kaydi:0
  translation_meaning_issues: ['unit_mismatch']
```

Doğal Türkçe sözcük sırası reddediliyor; “30 santigrat derece” ise bu kez özel ad
kapısına takılıyor. Düşük sıklık, ama doğru çeviri kaybı.

### 463-15 — [DÜŞÜK] Ayar işlem günlüğü fsync edilmiyor; yarım günlük siliniyor

**Konum:** `src/settings-security.js:838-854`, kurtarma `:763-772`.

**Ne oluyor:** `writeJsonTransaction` geçici dosyaları ve journal'ı `writeFileSync` ile
yazıyor; `fsyncFile`/dizin fsync'i yok. Güç kesintisinde journal'ın hedef rename'lerinden
önce kalıcı olmaması teorik olarak mümkün; kurtarma okunamayan journal'ı siliyor.
Diğer store'lar (watch-library, atomic-json) fsync kullanıyor.

**Etki:** Düşük olasılıklı güç kaybı senaryosunda ayar geri dönüşü yapılamaz. Kanıt
statiktir; gerçek güç kesintisi simüle edilmedi.

### 463-16 — [DÜŞÜK] İndirme başında tüm `*.invtmp-*` dosyaları siliniyor

**Konum:** `backend/media.py:387-392`.

**Ne oluyor:** Her indirme, çıktı klasöründeki tüm `*.invtmp-*` kalıntılarını siliyor.
Aynı klasöre eşzamanlı ikinci bir indirme başlarsa birincinin `name.invtmp-video` /
`name.invtmp-audio` dosyaları silinebilir. Tek uygulama örneğinde `mediaJobs.download`
tekildir; bu yüzden düşük, ama iki pencere/ikinci örnek veya harici araç senaryosunda
gerçek.

## C. Temiz bulunan alanlar

- **Zaman/timing:** `normalize_timings` 20.000 rastgele vaka; NaN/negatif/sıfır/örtüşme
  sonrası sonlu ve pozitif süreler korundu. `segment_to_chunks` / `split_segment_*`
  8.000 vaka; metin kaybı/sıralama bozulması yok.
- **Yazıcılar:** SRT/VTT/ASS/JSON round-trip; `-->`, `<`, `&`, boş satır, sayısal gövde
  ve tireli diyalog testleri tutarlı. Yeni `write_vtt` katı doğrulaması çalışıyor.
- **Halüsinasyon filtreleri:** 30 gerçekçi replikte yalnız gerçek tekrar döngüleri
  düştü; “Thank you.”, “The end.”, “Bye.” korundu.
- **`OutputTransaction`:** staging → prepared → committed geçişleri, owner-pid koruması
  ve rollback sırası statik olarak tutarlı; mevcut testler geçti.
- **IPC/yol/gizli anahtar:** 245 handler'ın tamamı yetki kapısına veya bilinçli
  kapanış kanalına bağlı; `canonicalLocalPath` aygıt ad alanını reddediyor; argv'de
  sır yok; dışa aktarım redaksiyonu testleri geçti.
- **Kalıcılık:** `PERSIST_VALUE_CONTROLS` 91/91 ve `PERSIST_CHECKBOX_CONTROLS` 66/66
  birebir eşleşiyor; watch-library tombstone/revision testleri geçti.
- **Renderer:** olay kapısı, kuyruk jobId/opts dondurma, oynatıcı generation, altyazı
  biçim koruma, timeline ve a11y testleri geçti.
- **Tarayıcı:** gezinme şeması, SSRF, adres modeli, oturum gizliliği ve çeviri önbelleği
  testleri geçti; bu turda yeni bir yüksek kanıt bulunmadı.

## D. Sınırlar

- Electron smoke/soak envanterinin tamamı koşulmadı; yalnız trusted-bridge smoke,
  UI smoke ve UI kontrast denetimi koşuldu.
- Gerçek GPU/CUDA, gerçek Whisper modeli, gerçek çeviri sağlayıcısı ve gerçek YouTube
  akışı kullanılmadı; ağ/anahtar gerektiren bulgular modül/fixture düzeyinde doğrulandı.
- 463-10, 463-12, 463-15, 463-16 statik kanıttır; gerçek yarış/güç kesintisi simüle
  edilmedi. 463-11'in gerçek gruplama sıklığı ölçülmedi.
- UI kontrast bulgusu headless Chromium ölçümüdür; gerçek DPI/GPU ortamında piksel
  doğrulaması yapılmadı.
- `npm test` süresi ~10 dakika; 549 dosyanın tamamı tek seferde koşuldu.

## E. Önerilen düzeltme sırası (uygulanmadı)

1. 463-02 (güvenlik), 463-03/04 (çeviri kalite kapıları), 463-01 (test + veri kaybı).
2. 463-05, 463-06, 463-07, 463-09.
3. 463-08, 463-10, 463-11.
4. 463-12 … 463-16 (dayanıklılık/biçim).

## Ek — kanıt komutları

```powershell
npm test
npm run test:electron-bridge
node tools/ui-smoke.mjs --strict --out <geçici-dizin>
node tools/audit-ui.mjs --strict --out <geçici-dizin>
node --check src\main.js
& backend\venv\Scripts\python.exe -m py_compile backend\transcribe.py
```

Rapor üretimi sırasında ürün kaynaklarında `git diff` boş kaldı; HEAD
`0e0193a16eed0d9cddd7ba2748b60abdfd2e14fd` değişmedi.
