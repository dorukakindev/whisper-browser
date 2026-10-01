# BROWSER_BUG_REPORT_267 — R318: Devin Review toplu triage (PR #236–#263)

**Kapsam:** PR #236–#263 aralığındaki Devin Review bulgularının triage'ı +
ilgili belge/test eksikleri. 14 doğrulanmış düzeltme (kod), 10 test-tarafı
düzeltme, ~10 belge tamamlama (devir notu merge-hash'leri, DEVIR-NOTU indeksi,
CHANGELOG `### Fixed` tekilleştirme).

## Kod düzeltmeleri

### `src/main.js` — iş günlüğü + sekme yaşam döngüsü

1. **Aynı-saniye günlük dosyasında bayt sayacı sıfırdan başlıyordu.**
   Append kipinde (`flags:'a'`) `jobLog.bytes=0` başlıyordu; aynı saniyede
   başlayan ikinci iş aynı dosyaya eklerken 4 MB kesim sınırı mevcut içeriği
   saymadan sessizce aşılırdı. `initialBytes = fs.statSync(file).size` +
   `bytes = initialBytes + Buffer.byteLength(header)`.

2. **Gecikmiş akış hatası yeni işin günlüğünü siliyordu.**
   `stream.on('error')` closuresız `jobLog=null` yapıyordu; eski akışın
   gecikmiş hatası yeni işin aktif günlüğünü sıfırlayıp olaylarını kaybediyordu.
   Kimlik kapısı: `if (jobLog && jobLog.stream === stream) jobLog = null`.

3. **Kesimden sonra olaylar hâlâ formatlanıyordu.** `jobLog.truncated`
   kontrolü switch'ten SONRA geliyordu — sınır dolunca büyük traceback metni
   yine de string'e çevrilip harcanıyordu. Erken çıkış `truncated`'i de
   kapsayacak şekilde girişe taşındı.

4. **Çökme/temizlik yolu manga retryable sayısını sıfırlamıyordu.**
   Hata listesi silinirken renderer'daki "Başarısızları yeniden dene" düğmesi
   boş listeyle etkin kalıyordu. `manga-state` artık
   `idle + translated:0 + retryable:0` yayımlar.

5. **`unloadBrowserTab` `loadError` bayrağını taşıyordu.** Bellekten
   boşaltılan sekme dirilince eski hata bayrağı `resumeRestoredBrowserPage`'in
   URL yeniden yükleme kararını bozuyordu. Unload'da `tab.loadError = null`.

6. **`media:probeTracks` `null` stream'e düşüyordu.** Bozuk ffprobe
   çıktısında `s.codec_type` TypeError atıyordu. Filtre `(s) => s && s.codec_type === 'audio'`.

### `src/renderer/renderer.js`

7. **Sayfa çevirisi scope alanı bilinmeyen değerleri kabul ediyordu.**
   `browserPageScope` ham `tab.browserPageScope` dışındaki eski/saklı
   değerleri de alıyordu. Whitelist yedeği `['article','whole','selection']`.

8. **Sponsor kategori değişimi segmentleri yenilemiyordu.**
   `browserSponsorCategories` `change` dinleyicisi eksikti; ayar değişince
   açık videoda eski kategori bölümleri kalıyordu.

9. **Gömülü iz ipucu çıkarılamayan metin izlerini saymıyordu.**
   `!extractable && !requiresOcr` izler (bozuk indeks vb.) ne hazır ne bitmap
   sayısındaydı — ipucu "0 görüntü tabanlı iz" diyebiliyordu. Ayrı
   `unreadCount` hükmü.

10. **Yan-boyutlandırıcı ikinci parmağı da sürüklüyordu.** `sideResizer`
    çoklu dokunuşta `pointerId` kapısı yoktu; ikinci parmak move/up olayları
    sürüklemeyi ele geçiriyordu. `dragPointerId` kilidi.

11. **PDF çevirisi okuyucu kimliğini hash ile karıştırıyordu.** Aynı dosya
    yeniden açılınca `pdfHash` aynı kalır — eski okuyucunun döngüsü yeni
    okuyucunun boş sayfa haritasıyla sürüyordu; iptal paket arasında da
    işlemiyordu. `player.pdfReader !== reader` kimlik karşılaştırması +
    `reader.cancelRequested` bayrağı (paket arası + `all` iç-döngüde
    kontrol edilir; iptal düğmesi `reader.pdfHash` üzerinden ana sürece de
    iletilir).

12. **Kanal sayfalama kartları düğme satırının altına ekleniyordu.**
    `openInvidiousChannelPage` "daha fazla" yüklerken kartları `appendChild`
    ile listenin en sonuna, düğmenin ALTINA ekliyordu.
    `tabBody.insertBefore(card, row)` + "boş sayfa" kapısı
    `!added && got.length < 20` (tamamı yinelenen/gizli dolu sayfada düğme
    kaldırılmaz — sonraki sayfalar yeni video içerebilir).

### `src/browser-address-model.js`

13. **`foldSearchIndex` jamo NFC birimi map kaydı eksikti.** L+V+V gibi
    birleşmeyen jamo dizileri dense'de 2 UTF-16 birimi üretirken `map` tek
    kayıt itiyordu — omnibox vurgusu özgün metinle hizadan çıkıyordu.
    Map itimi `syllable.length` kere yapılır. Kırmızı kanıt: master'da
    `dense.length=2, map.length=1`; dalda eşit.

### `src/ytdlp-runtime.js` + `backend/update_ytdlp.py`

14. **Yarım silinmiş paket `previous`'a düşürülüyordu.** Silme tarafı eksik
    modül kontrolü yapmıyordu; kısmen silinmiş kurulum sağlıklı sanılıp
    önceki sürüme düşüyordu. `_RUNTIME_REQUIRED_FILES`/`RUNTIME_REQUIRED_MODULES`
    iki tarafta eşlenik liste + `_healthy_package()` kapısı.

## Test-tarafı düzeltmeler (harness kusuru, ürün bug'ı değil)

- `tests/ipc-payload-fuzz.test.js` — jsdom structuredClone sentinel
  deserializer hizası (coverage sayımı sarmalanıyordu).
- `tests/ytdlp-runtime.test.js`, `tests/smarttube-channel-depth.test.js`,
  `tests/dom-innerhtml-ratchet.test.js`, `tests/subs-shift-accuracy.test.js`,
  `tests/log-rotation.test.js`, `tests/disk-full.test.js`,
  `tests/attr-sink-ratchet.test.js`, `tests/deep-link-surface.test.js`,
  `tests/browser-places-import-matrix.test.js`, `tests/run-resource-soak.js`
  — ilgili review flag'inin işaret ettiği bayat kalıp/sayımlar güncellendi.
- **Yeni:** `tests/review-triage-r318.test.js` — 11 senaryo (1 fonksiyonel
  foldSearchIndex hiza testi + 10 statik sözleşme kilidi).

## Önceden merge edilmiş bulgular (tekrar iş gerekmedi)

- `queueSnapshotForDisk` NaN/±Infinity normalizasyonu — R161 (#86) kapsamında
  `sanitizePublicValue`'da zaten `Number.isFinite` kapılı.
- `window-state` kelepçe — R277 (#225) saf modül + testleriyle kapandı.
- Gömülü altyazı mutlak-indeks sözleşmesi — R305 (#252) kapsamında kapandı.

## Belge düzeltmeleri

- 8 devir notu merge-hash tamamlama (0610/0626/0637/0654/1130/1150/1710/1730).
- `DEVIR-NOTU.md` indeks sıralama + eksik girişler.
- `CHANGELOG.md` — 5 Duplicate `### Fixed` başlık grubu tekilleştirildi.

## Doğrulama

- `node --test tests/review-triage-r318.test.js` → **11/11 PASS**.
- Kırmızı kanıt: foldSearchIndex korpusu master'da `map.length=1,
  dense.length=2`; dalda eşit.
- `node --check src/main.js` / `renderer.js` ✓,
  `python3 -m py_compile backend/update_ytdlp.py` ✓.

## Kalan / needs-human

- #223 buhar-cloudflare flag'i — thread'de analiz; kullanıcı kararı.
- Windows doğrulama oturumu (devin-3c20a465) suspend — NTP imleç +
  PDF açma el-kontrolü dışarıda.
