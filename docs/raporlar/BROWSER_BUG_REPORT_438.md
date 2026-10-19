# BROWSER_BUG_REPORT_438 — Altyazı ve dublaj aralığı tekrar giriliyordu

Eksik akış: browser Whisper5–10dk seçimi ses üretim penceresine aktarılmıyordu. Aktif altyazının clipRange bilgisi veya aynı videonun Whisper aralığı pencere açılınca otomatik uygulanır. Manuel değişiklik aynı bağlamda korunur; başka videoya eski aralık taşınmaz.

Hedefli UI testi ve ayrı Windows Electron görsel kontrolü geçti. Eski dosyadan aralık tahmini/yeniden başlatma metadata garantisi yok. [Devir ve kanıt](../devir/2026-10-16-0430.md).
