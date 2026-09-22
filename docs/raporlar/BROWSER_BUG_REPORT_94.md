# Devin cloud değişiklikleri: doğrulama ve güvenli yerel aktarım

Tarih: 2026-09-21. İncelenen aralık: `d523405..82a45740b8f25b661ae7a643e924f2450a99d8be` (uzak `master` üzerindeki 10 yeni commit). İnceleme, kullanıcı değişiklikleri bulunan kök çalışma ağacını değiştirmeden `scratch/devin-review` çalışma ağacında yapıldı.

## Doğrulanmış bulgular

1. **P1 — Başka uygulamanın OAuth istemcisi gömülmüştü.** `src/main.js` içindeki varsayılan YouTube TV istemci ID/secret değerleri, uygulamanın kendi kayıtlı istemcisi değildi. Böyle bir varsayılanla kişisel hesap girişinin güvenilir, sürdürülebilir veya Google politikalarına uygun olduğu iddia edilemez. Varsayılan kaldırıldı; device-code girişinde kullanıcının kendi istemci bilgileri yeniden zorunlu. QR akışı korundu. Kendi istemcisiyle gerçek hesap girişinin çalışacağı hâlâ canlı kabul gerektiriyor. Google OAuth ilkesi: https://developers.google.com/identity/protocols/oauth2/policies
2. **P1 — Gereksiz geniş YouTube yetkisi.** `backend/youtube.py` salt-okunur kapsam yerine hesabı yönetmeye izin veren `https://www.googleapis.com/auth/youtube` kapsamını istemeye başlamıştı. `youtube.readonly` geri getirildi. Kapsamların resmî listesi: https://developers.google.com/identity/protocols/oauth2/scopes
3. **P2 — OAuth istemcisi değişince eski token kalıyordu.** `youtube:setClient` istemciyi değiştirirken önceki istemcinin erişim/yenileme token'ını koruyordu. İstemci değişiminde token ve hesap özeti temizleniyor; istemci eksikken legacy token ile yenileme de reddediliyor. Daha önce Google hesabında verilmiş izinleri otomatik iptal etmiyoruz; kullanıcı Google hesap izinlerinden kaldırabilir.
4. **P2 — SmartTube kart sayıları ve kanal kimliği.** `backend/youtube.py` `12K views` metnini 12 olarak ayrıştırıyordu; kanal kimliği araması ilgisiz ilk `onTap` üzerinde sonlanabiliyordu. K/M sayıları ve sonraki geçerli browse endpoint'i için ayrıştırma ve fixture düzeltildi.
5. **Test kusuru — eski DOM beklentileri.** SmartTube Electron smoke'u yeni kart kabı ve fallback düğmesini eski seçicilerle aradığı için ürün doğru çalışsa bile başarısız oluyordu. Güncel DOM seçicileriyle davranış testi tekrar yeşil. Ayrı bridge smoke'u tek çalışma ağacına sabitlenmiş FFmpeg yolu kullandığından yeni checkout'ta kırılıyordu; mevcut test media-runtime çözücüsüne geçirildi.

## Korunan iş ve sınırlar

Kuyruk Sonraki/yeniden devam, refine önizleme indeksi, başarısız kartta overlay geri gelmesi, SmartTube yerel fallback ve lockup kart ayrıştırması kaldırılmadı. Bunların otomatik testleri geçti; gerçek YouTube hesabı, OAuth/QR tamamlanması, kişisel akış ve uzun video kullanımının canlı kabulü yapılmadı. Mock sonuçları bu kabulün yerine geçmez. Gömülü başka-istemciyle sıfır-kurulum oturum açma güvenlik nedeniyle geri alındı; geçerli uygulama istemcisiyle yetkilendirme için ayrı ürün/hesap kurulumu gerekebilir.

## Kanıt

- `backend/test_youtube.py`: 19/19.
- `tests/report67-smarttube-wiring.test.js`: 84/84.
- `tests/report70-youtube-oauth.test.js`: 20/20; istemci değiştirme/token invalidasyonu dahil.
- `npm test`: tüm dosyalar geçti (izole çalışma ağacı; mevcut Python venv ve bağımlılıklar kullanıldı).
- `npm run test:electron-bridge`: geçti.
- `node tests/run-electron-smokes.js smarttube-boot`: geçti; yalın smoke penceresindeki diğer mocklanmamış kanallar bu doğrulamanın kapsamında değil.
- `node --check` ve Python sözdizimi kontrolleri geçti.

Bu rapor, tüm tarayıcı/DRM/YouTube site varyantlarının veya gerçek oturum açmanın doğrulandığı iddiası değildir.
