# BROWSER_BUG_REPORT_440 — Ses bağlamı, oynatıcı ana sayfa, Ctrl+wheel

1. **Bug düzeltildi:** yeni video ses formunda önceki SRT/manuel arka plan kalıyordu. Medya kimliği değişiminde ikisi temizlenir; aynı medyadaki kullanıcı ayarı korunur. Regresyon geçti.
2. **Tasarım:** ana sayfada dosya/bağlantı/kütüphane girişleri belirsizdi. Kompakt üç giriş kartı, başlık/açıklama, sarılan arama çubuğu ve sade navigasyon; EN/TR,940px/geniş görsel kontrol.
3. **Eksik işlev:** Ctrl+wheel native browser sayfa zoom'u bağlı değildi. İzole güvenilir wheel→kimliği doğrulanmış main IPC→ortak zoom helper; %50–300, site profili ve yüzde gösterimi. Yerel HTTP gerçek WebContentsView/CDP Ctrl+wheel1→1.1→1; uygulama zoom1 kaldı.

Hedefli Node, Electron bridge ve SmartTube boot/hesap/feed fixture smoke geçti. Canlı hesap/GPU/siteler ve genel CI iddia edilmez. [Devir ve sınırlar](../devir/2026-10-16-1106.md).
