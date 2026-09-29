# BROWSER BUG REPORT 204 — R247: whisper-pdf kaynak kimliği tahmin edilebilir (security triage)

- Tarih: 2026-09-29 — dal: `fix/r247-pdf-nonce`
- Kaynak: Devin Review, PR #189 (`a1fa545`) — 1 security + 1 flag

## 1. Bulgu (security): başlıksız istekler PDF köken kapısını aşıyor

**Kök neden:** `resourceId = sha256('pdf-resource:' + pdfHash)` — pdfHash,
dosya boyutu + ilk/son parçanın sha256'sı; tamamen deterministik. Dosya
içeriğini bilen (veya tahmin edebilen) herhangi bir sayfa kimliği aynı
formülle hesaplayabilir. R246 kapısı da Origin'siz + referrer'siz isteği
kabul ettiği için (kendi GET fetch'lerimiz için gerekli), `referrerpolicy=
"no-referrer"`'lı bir `<embed>`/`<img>` hem `originAllowed` hem
`referrerAllowed` kapısından geçiyordu — uzak bir sayfa tahmin ettiği
belgeyi kendi sayfasında gösterebilirdi.

**Düzeltme:** `pdfResourceNonce = randomBytes(24).toString('hex')` — oturum
başına üretilir; `resourceId = sha256('pdf-resource:' + nonce + ':' +
pdfHash)`. İçerik bilinse bile kimlik tahmin edilemez; her yeniden
başlatmada değişir. `pdfHash` deterministik kalır — kalıcı durum dosyaları
(`pdf-state`) ona dayanır, etkilenmez. Köken/referrer kapıları derinlemesine
savunma olarak korunuyor.

**Kanıt:** `whisper-pdf-protocol.test.js` yeni senaryo — aynı belge iki
ayrı context'te (iki "oturum") farklı `resourceId` üretir, `pdfHash` aynı
kalır, format 64-hex korunur. Kırmızı kanıtı: aynı test dosyası base
main.js'te `resourceId` eşitliğinde düşer (1 FAIL); düzeltmeyle 8/8 PASS.

## 2. Bulgu (flag): native imleç davranışı vm testiyle ölçülmüyor

VM testi `setBounds`/`setVisible` çağrılarını kilitler; Windows'ta gerçek
HWND işaretçi hit-test'i ölçemez. Zaten bilinen sınır — PR #189'un
"doğrulanmayan" bölümünde yazılı; Windows doğrulama oturumuna
(devin-3c20a465…) elle-kontrol isteği iletildi (NTP tıklama/hover + PDF
açma). Kod değişikliği gerekmiyor → `needs_human` + thread analizi.

## Test

- `node --test tests/whisper-pdf-protocol.test.js` — 8/8 PASS.
- `node --check src/main.js` — temiz.
- Kırmızı: base main.js ile aynı dosya 1 FAIL.

## Windows etkisi

- Kimlik biçimi değişmez (64-hex); fileUrl her `pdf:open`'da üretilir —
  oturum içi davranış aynı. Yeniden başlatmada eski fileUrl artık
  geçersizdir (zaten bellek içi haritaya dayanıyordu).
- `start.bat`/`install.bat` dokunulmadı.

## Çalıştırılmayan kontroller

- Gerçek Windows'ta PDF açma + NTP imleç elle doğrulaması açık iş
  (R236/R246 ile aynı madde).
- `npm test` tam koşusu yapılmadı (hedefli set).
