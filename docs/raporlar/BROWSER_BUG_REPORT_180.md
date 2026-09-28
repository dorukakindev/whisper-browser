# BROWSER_BUG_REPORT_180 — R222 Electron çeviri hattı paketi

Tarih: 2026-09-28 · Dal: `codex/r222-electron-translate-1790625177` · Kapsam: kullanıcının doğruladığı çeviri-hattı bulgularının Electron/`src/` yarısı + kullanıcı harness'ı (`ceviri-denetimi`) ile bulunan iki ek gerçek bug. Backend yarısı PR #151'de (R220/R221, rapor 179).

## Düzeltilen doğrulanmış bulgular

| # | Bulgu | Kök neden | Düzeltme |
|---|-------|-----------|----------|
| E1 | Paragraf içi bağlantılar sayfa çevirisinde metni çiftliyor | `blockRoot` `<p>` içindeki `<a>/<button>/<label>`'ı ayrı blok sayıyordu; üst ve iç blok çevirileri üst üste yazılıyordu ("Dosyayı buradaindirmek için…") | `browser-page-translate.js` — tarama artık `p,h1..h6,li,blockquote,figcaption,td,th,dt,dd,summary` üst bloğuna tırmanır; etkileşimli kök yalnız üst blok yoksa kullanılır. Bağlantı öğesi DOM'da korunur (test kanıtlı) |
| E2 | Tek hatalı blok komşu doğru çevirileri düşürüyor | `decodePageTranslation` herhangi bir blokta korumalı-işaret/bağlam-sızıntısı kapısına takılınca tüm yanıtı atıyordu | Blok bazlı kabul: hatalı blok kaynak metinle kalır, `failedIds` raporlanır |
| E3 | `failedIds`'li sonuç önbelleğe yazılırsa kaynak-echo kalıcılaşır | Blok bazlı kabul sonrası önbellek yazımı sonucu tartmadan yapıyordu | `browser-translation-scheduler.js` — `result.failedIds` boş değilse `writeCache` atlanır |
| E4 | Kısa çeviriler kalıcı hataya düşüyor (kullanıcı R220-4) | "I don't / know." → "Bilmiyorum." tek parça; `PARTS_MISSING` fırlatılıyor, `distributeTranslation`'ın birleştirme yoluna hiç ulaşılmıyordu | `subtitle-sentence-layout.js` `merged` sözleşmesi + scheduler `mergedCue`/`fitTranslationParts` → tek birleşik balon; `coveredCueIds` taşınır |
| E5 | Birleşik balon ikinci cue'yu "eksik" gösteriyordu (kullanıcı uyarısı) | `cueIdsForStage` yalnız doğrudan cue↔parça eşleşmesi sayıyordu | `browser-translation-integrity.js` — `coveredCueIds` tüm kapsanan kaynak kimliklerini tamamlanmış işaretler |
| E6 | Kesin hatalar istek fırtınası üretiyor (R220-5) | `content_filter`/yarım-yanıt/bozuk-JSON HTTP kodu taşımıyor → tüm rotalar + scheduler 3× tekrarı = cümle başına 6–12 istek | `main.js` `definitiveTranslationError` (finish_reason=length, content_filter, düşünme kırılması → `retryable:false`) + scheduler `isDefinitiveTranslateError` + ardışık kesin-hata kesici (`consecutiveDefinitiveFailures` → sağlayıcı-kesici davranışı) |
| E7 | Aynı zaman aralığındaki cue'lar aynı çeviriyle eşleşiyordu | `translationsForCues` eş-örtüşmede hep ilk satırı seçiyordu → iki ayrı cue tek çeviriyi paylaşıyordu (`pairing_test.js` kanıtı: "Where did you go?" → "TOKYO İSTASYONU") | `renderer.js` — kullanılmamış eş-örtüşme satırı tercih edilir; birleşik satırın çoklu-cue kapsaması (merged reuse) korunur. Yeni `tests/cue-translation-pairing.test.js` (5 senaryo) |
| E8 | Çeviri önbelleği ana süreci donduruyor (R221-6) | 50k kayıtlı ~13MB JSON her yazımda baştan serileştiriliyor + `.bak` kopyası (~60ms/flush, 3sn'de bir) | `browser-translation-cache.js` — sona-ekli `.journal` (append-only `{k,v,t}` satırları) + eşikli sıkıştırma (1MB/40 flush/10dk) + yüklemede journal replay. `tests/browser-translation-cache.test.js` |
| E9 | PDF çeviri önbelleği sağlayıcı karışıyor (kullanıcı notu) | Önbellek kimliğinde endpoint yoktu; aynı model adıyla farklı sağlayıcı eski sonuçları döndürürdü | `pdf-translate.js` — `normalizedIdentity` + state + `recordPdfPageTranslation`'a `endpoint` eklendi |

## Harness sınıflandırması

- `pairing_test.js`, `replace_links2.js` → GERÇEK BUG (E1, E7) — düzeltildi, yukarıdaki davranış çıktıları doğrulandı.
- `term_cache.js` (60→29→26 istek) → beklenen davranış: `terminologyVersion` önbellek anahtarında; sözlük evrimi eski-sözlüklü çevirileri bilinçli geçersiz kılar, 0'a yakınsar.

## Doğrulama

- `npm test` hedefli dosyalar: `browser-page-translate`, `browser-translation-cache`, `browser-translation-merged`, `cue-translation-pairing`, `pdf-translate`, `subtitle-sentence-layout` — yeşil.
- Harness: `live_page.js`, `replace_links2.js`, `pairing_test.js`, `fuzz_parts.js` mock 8810'a karşı GEÇTİ.

## Windows etkisi / doğrulanmayanlar

- Journal dosyası `cache/` altında `.journal` uzantılı; Windows'ta dosya adı/journal büyümesi normal NTFS davranışı. Sıkıştırma `.bak` korumasını korur.
- Gerçek sağlayıcıda `content_filter`/düşünen-model yanıtı görülmedi — kesin-hata listesi mock ve kod incelemesiyle doğrulandı; yeni bir kesin-hata kalıbı eklemek `DEFINITIVE_ERROR_PATTERN`'e tek satır.
- Sayfa-tarama değişikliği gerçek sitelerde blockRoot blast-radius'ını daraltır; nav/standalone etkileşimliler kendi bloklarını korur (jsdom fixture'larında doğrulandı), ancak tüm web kapsanamaz — el kontrolü önerilir.
