# BROWSER BUG REPORT 286 — R326 güvenlik denetim turu

**Tarih:** 2026-09-30 · **Dal:** `devin/<ts>-r326-csp-connectsrc` · **Tür:** politika denetimi + 1 sertleştirme

## Kapsam

R326-1..6: CSP/permission policy, webPreferences matrisi, renderer+main ağ
envanteri (SSRF), openExternal/openPath, IPC arg-doğrulama, sandbox
invariant'ları.

## Bulgular

### B-326-01 — connect-src içinde ölü `https:` izni
`index.html` CSP'si `connect-src 'self' whisper-pdf: https:` idi; renderer
kaynaklarında uzak bağlantı kuran yüzey yok (tek `fetch` `whisper-pdf:`;
XHR/WebSocket/EventSource/sendBeacon sıfır). Ölü izin, olası bir XSS'in
veri exfil kanalı olurdu. **Düzeltme:** `https:` kaldırıldı.

### Doğrulananlar (bug yok)
- **webPreferences:** 5 yaratım noktası (ana pencere, TV, worker,
  WebContentsView, popup-yardımcısı) `sandbox+contextIsolation+nodeIntegration:false`
  kilidinde; `electron-security.test.js` 1326 kontrolle ratchet'li.
- **main fetch envanteri:** 3 site — LLM/manga uçları `safeTranslationEndpoint`
  (https zorunlu, http yalnız localhost; query/hash sıyrılır), YouTube RSS
  `channel_id` `^UC[\w-]{15,30}$` regex kapılı, sabit youtube.com host'u.
  Not: kullanıcı-tanımlı https endpoint bilinçli (kendi sağlayıcısı).
- **shell açılışları:** `openExternal` tek politika kapısı + web-kaynaklı
  3sn oran sınırı; `openPath` kullanıcı onayı + `canonicalLocalPath`
  yeniden-doğrulama + `shellTargetAccess` allowlist.
- **IPC:** 213/213 kanal 9.240 hostile-çağrıyla fuzz'lanmış (R275).

## Eklenen kilit

`tests/csp-policy.test.js` (5 test): connect-src envanteri, script-src
katılığı, none direktifleri, mini-altküme, renderer uzak-yüzey kanıtı.

## Windows etkisi

Yok — CSP daralması yalnız renderer paketini bağlar.
