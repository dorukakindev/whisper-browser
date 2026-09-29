# BROWSER BUG REPORT 205 — R248: nonce testi türetim formülünü kilitlemiyordu

- Tarih: 2026-09-29 — dal: `fix/r248-nonce-test`
- Kaynak: Devin Review, PR #191 (`b9e3750`) — 1 flag

## Bulgu (flag): nonce testinde tahmin edilebilir tuz boşluğu

**Kök neden:** R247 testi yalnız iki context'in farklı `resourceId`
üretmesini ölçüyordu — `Date.now()` gibi oturum başlangıcından tahmin
edilebilen bir tuz da bu denetimden geçerdi; türetim formülü
(`sha256('pdf-resource:' + nonce + ':' + pdfHash)`) kilitli değildi.

**Düzeltme (yalnız test):** `makeInspect` artık enjekte edilebilir
`randomBytes` alıyor; sabit `0x42×24` nonce'lu context'te üretilen
`resourceId`, test içinde bağımsız hesaplanan beklenen digest'e eşit
olmalı. Tuz'un karıştırılma konumu ve biçimi böylece sözleşmeyi kilitler.

**Kanıt:** aynı test dosyası nonce-öncesi main.js'te 1 FAIL (kimlikler
eşit çıkıyordu); dalda 8/8 PASS.

## Windows etkisi

Yalnız test dosyası — ürün davranışı değişmedi.

## Çalıştırılmayan kontroller

- Gerçek Windows PDF/NTP elle doğrulaması açık (Windows oturumunda).
- `npm test` tam koşusu yapılmadı (hedefli set).
