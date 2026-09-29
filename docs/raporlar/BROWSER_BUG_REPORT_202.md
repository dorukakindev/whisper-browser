# BROWSER_BUG_REPORT_202 — R245: Devin Review toplu triage (#181 + #184)

Tarih: 2026-09-29 · Dal: `fix/r245-review-181-184` (master `005f292` üzerine rebase)

İki PR'ın Devin Review bulguları triage edildi. Doğrulanan 5 bulgu düzeltildi;
tasarım/kapsam kararı gerektirenler tek tek thread'de analiz edilip
needs_human raporlandı.

## Düzeltilen bulgular

### 1. Kaynak dili ordinal kuralı (#181 BUG_0001)

`sentence_part_boundary_issue(source_parts, translated_parts)` kaynak parçanın
cümle-sonu sayısını hedef dilin ordinal kuralıyla ölçüyordu. Türkçe
hedefleyen bir çeviride İngilizce kaynakta görünen `Really. 3. Then` gibi
numaralandırma, TR'de "21. yüzyıl" kalıbında geçerli olduğundan sıra sayısı
sayılıyor ve gerçek cümle sonu olarak sayılmıyordu — doğru iki-cümle çeviri
"fazla cümle" diye reddediliyordu.

**Düzeltme:** `sentence_end_count`/`internal_sentence_end_count`/`sentence_part_boundary_issue`
opsiyonel `language` parametresi aldı; çağrı yeri `source_lang` geçiriyor.
Kaynak dil ordinal yazıyorsa (tr/de/cs/…/sv) kural aynen kalır.

Kanıt (master'da KIRMIZI → dalda yeşil):
`backend/test_sentence_distribution.py::test_boundary_issue_counts_source_under_source_language_ordinals`.

### 2. VTT NOT/STİL/REGION bloğu içindeki sahte cue sınırı (#181 BUG_0002)

`parse_srt` VTT yolunda meta bloklar yalnız cue gövdesinde filtreleniyordu;
`NOTE` paragrafının İÇİNDE temiz satırda duran zaman kodu (`00:10.000 -->
00:12.000`) ayrı bir cue sınırı sayılıp "editor note text" metnini üçüncü bir
cue gibi üretiyordu — not metni çeviriye ve çıktı dosyasına sızardı.

**Düzeltme:** VTT dosyalarında meta-paragraf taraması `timing_indices`
hesabından önce koşuyor; meta satırlar sınır adaylığından çıkarıldı.

Kanıt (master'da KIRMIZI → dalda yeşil):
`backend/test_core_regressions_r4.py::test_vtt_note_block_timing_line_is_not_a_cue_boundary`.

### 3. İlke hataları ağ yedeğini tetikliyordu (#184 SEC_0001/BUG)

`fetchBrowserBuffer` doğrudan `DIRECT` bacak düşünce proxy zincirini deniyor.
Boyut sınırı (`ESUBTITLE_LIMIT`) ve kullanıcı iptali (`ERR_ABORTED`) ilke
hatasıdır — proxy yedeğinde de aynı yanıt/iptal geçerli; boşuna ikinci istek
atılıyordu (ve iptal edilmiş işte gereksiz trafik).

**Düzeltme:** `requestPinnedSubtitleBuffer` kodlu hata üretir
(`destroy(Object.assign(new Error(…), {code}))`); çağrı yeri yedeğe yalnız
`proxyChain.length ≥ 2` ve ilke hatası olmayan durumlarda düşer.

Kanıt (master'da KIRMIZI → dalda yeşil):
`tests/browser-subtitle-dns-pin.test.js` — `pinned istek boyut sınırında
ESUBTITLE_LIMIT`, `pinned istek iptalde ERR_ABORTED`, `çok bacaklı zincirde
boyut sınırı ilke hatası proxy yedeği tetiklemez`, `çok bacaklı zincirde
kullanıcı iptali proxy yedeği tetiklemez`.

### 4. Proxy yedeğinde TOCTOU yeniden-doğrulama (#184 SEC_0002)

Pin doğrulaması ile Chromium'a devredilen ikinci istek arasında DNS
değişmiş olabilir (rebinding penceresi). Chromium bacak kendi çözümlemesini
yapacağı için `session.fetch`'ten önce `assertPublicBrowserSubtitleUrl`
yeniden koşturuluyor.

Kanıt: `proxy yedeğinden önce hedef yeniden doğrulanır (TOCTOU daralması)`
(master'da KIRMIZI → dalda yeşil).

### 5. Önizleme tıklama yolu kapsamı (#181 FLAG_0002)

`$('browserPagePreview')` click dinleyicisi + `previewBrowserPage` +
`renderBrowserPagePreview` VM dilimiyle kilitlendi (sağlayıcı gerekmez):
açma → API çağrısı + panel + 'Önizlemeyi gizle'; ikinci tıklama → kapanış +
durum sıfırlama; API hatası → panel metni, durum boş.

Kanıt: `tests/browser-page-preview.test.js` (3/3; mevcut-davranış kilidi).

## needs_human bırakılan bulgular

- **#184 BUG** — sondaki flaş cue'nun sessizlik farkı görünürlüğü: kasıtlı
  flaş-birleştirme dengelemesi (kısa cue görünürlüğü vs. sessizlik sıçraması);
  kapsam değişikliği kullanıcı kararı.
- **#184 INFO** — bütünlük raporu bilgi notu.
- **#184 FLAG** — gerçek proxy'li ortamda pin davranışı; DNS proxy'de çözülür
  (CONNECT tünelleme) — Windows oturumunda doğrulanacak.
- **#181 FLAG_0001** — araç çubuğu kapsam notu.
- **#183/#185 (3 flag)** — devir notu "Çalıştırılmayan kontroller: Yok"
  ifadesinin belge-işlerinde ürün testi koşulmadığını gizlemesi; bundan
  böyle belge turlarında açıkça "belge değişikliği: ürün testleri
  koşulmadı; yalnız bağlantı/içerik/diff kontrolü" yazılacak (bu notta
  uygulanmıştır).

## Kapsam / sınırlar

- `npm test` tam paket koşulmadı; hedefli: dns-pin 14, page-preview 3,
  tab-preview 4, integrity + page-translate dosyaları — yeşil.
- Backend: `test_transcribe.py` 205/205, `test_sentence_distribution.py`
  43 PASS, `test_core_regressions_r4.py` 16/16, `py_compile` temiz.
- Kırmızı kanıtı: dns-pin 5 test + ordinal + VTT testi master'da düşer,
  dalda geçer.
- Windows etkisi: yalnız Node/Python mantığı — platformdan bağımsız; proxy
  ortam davranışı Windows doğrulama oturumunda izlenecek.
