# BROWSER_BUG_REPORT_200 — R243: PR #182 Devin Review triage

**Tarih:** 2026-09-29 · **Dal:** `fix/r243-review-182` · **Temel:** `483872f` (R242 merge)

PR #182 Devin Review bulguları: 3 bug + 3 security + 2 flag. Üç bug ve bir
security düzeltildi; ikisi needs_human'a analizle bırakıldı.

## Düzeltilenler

### BUG-2 — `DIRECT; PROXY` zincirinde proxy yedeği kullanılmıyordu
`resolveProxy` `DIRECT; PROXY x:1` döndürdüğünde pinned Node bacak deneniyor,
ama doğrudan bağlantı düşerse hata aynen yükseliyordu — Chromium'un zincir
yedekleme davranışı kayboluyordu. Artık zincirde ek bacak varsa
`session.fetch` denenir; tek `DIRECT` bacakta hata yine yükselir.

### BUG-3 — `resolveProxy` hatası DIRECT varsayılıyordu
Çözümleme çökerse `proxy='DIRECT'` kalıyor, proxy-gerektiren ağda Node
doğrudan bağlanıp indirmeyi imkânsız kılıyordu. Artık belirsizlikte
(`proxyUnknown`) Chromium yolu kullanılır — R242 öncesi davranış.

### BUG-1 — sondaki flaş cue'nun konuşma zamanı kayboluyordu
`min_dur<0.2` yapılandırmasında sonda kalan <200 ms cue öncekinin metnine
ekleniyordu ama zamanı öncekinde kalıyordu: uzun sessizlik sonrası son söz
yalnız erken cue'da görünürdü. Artık `merged[-1][1] = max(merged[-1][1], e)`
ile öncekinin bitişi kısa cue'nun bitişine uzatılır.

### SEC-2 — Secure çerezler http üzerinden taşınıyordu
Aynı-köken pinned istekte `session.cookies.get` sonuçları koşulsuz `Cookie`
başlığına yazılıyordu; `secure` işaretli çerezler düz-metin http isteğine
sızabilirdi. Artık `requestUrl` şeması `https:` değilse `cookie.secure`
olanlar elenir.

## needs_human bırakılanlar

### SEC-1 + FLAG-1 — proxy/interceptor yolunda rebinding penceresi
`session.fetch` kullanılan yollarda Chromium/proxy kendi DNS çözümlemesini
yapar; HTTP CONNECT proxy'sinde DNS'i proxy çözdüğü için istemci tarafı
sabitleme mümkün değildir (CONNECT tünelleme + proxy-auth uç durumları kapsam
genişletir). Interceptor'lü yolda istek DNS'i hiç kullanmaz. İlk DNS
doğrulaması her yolda uygulanır; kalan pencere yalnız proxy'li ortamda,
doğrulama ile istek arasında DNS flip'ine bağlıdır.

### SEC-3 — nonce URL ASS alan sayfaya görünür
Sayfa, kendi DOM'una eklenen `whisper-assets://ass-<nonce>/...` kaynağını
gözleyebilir (perf timeline / script taraması). Kalan yüzey: yalnızca ASS
overlay'i alan sayfalar (öncesi: tüm sayfalar). Tam kapanma varlık
dağıtımının yeniden mimarisi ister (jassub'ı inline enjekte, worker/wasm/font
için Blob/data-URL).

### FLAG-2 — cue birleştirme segment kimliğini kaydırır
Kanıtla kapalı: `realign_segment_metrics` metrikleri normalize sonrası
zamanla yeniden bağlar (transcribe.py:6867); `assign_speakers` normalize
sonrası nihai entries üzerinde çalışır; word-JSON segment sözcüklerinden
yazılır, cue indeksine bağlı değil.

## Kanıtlar

- `tests/browser-subtitle-dns-pin.test.js`: 4 yeni senaryo (resolveProxy
  çökmesi→fetch, DIRECT;PROXY pinned-fail→fetch, DIRECT pinned-fail→hata,
  http secure-cookie süzgeci) — 21/21 PASS.
- `backend/test_transcribe.py`: `test_normalize_timings_last_flash_keeps_speech_time`
  (min_dur=0.05 ile gerçek flaş yolu) — 205/205 PASS.
- `node --check` + `py_compile` temiz.

## Doğrulanmayanlar

- `DIRECT; PROXY` zincir davranışı gerçek PAC/proxy'li ortamda elle denenmedi
  (stub kanıtlı).
