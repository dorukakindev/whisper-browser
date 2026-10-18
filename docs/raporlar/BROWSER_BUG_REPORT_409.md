# Rapor 409 — Küçük browser/oynatıcı tasarım turu

2026-10-14. Kullanıcı kısa çalışma ve az test istedi.

- Dar browser penceresinde genel oynatıcı CSS'i `player-body` alanını flex
  sütuna çeviriyordu. Browser grid'i yüksekliğini kaybediyor, durum kapsülü
  araç çubuğunun üstüne çıkıyordu. Browser modunda grid korunarak düzeltildi.
- Dar araç çubuğunda adres alanı sıkışıyordu. 920px altında sayfa çevirisi
  metni yerine mevcut ikon gösteriliyor; düğmenin aria-label/title'ı korunuyor.
  Altyazı etiketi uzunken ellipsis ile sınırlı; eylemler min-width:0 kullanıyor.
- İş iptal kontrolündeki küçük × belirsizdi. Mevcut handler korunarak
  EN/TR “Durdur / Stop” etiketi, 32px yükseklik ve görünür odak eklendi.

Windows Chrome gerçek renderer/CSS + fixture API: boş/yüklü sekmede 1400/720px
ekran kontrolü geçti. Dar ekranda browser alanı tekrar pencereyi dolduruyor,
adres alanı ve Stop okunuyor, önceki durum kapsülü bindirmesi yok. Görseller
`tmp/ui-polish/` altında Git dışında. `ui-locale` ve `git diff --check` geçti.
Yeni test yazılmadı, tam paket/ek Electron testi koşulmadı. Gerçek YouTube,
native video, DPI, DRM veya start.bat yeni koşusu yapılmadı. JS/backend,
kurulum/GPU ve bağımlılık değişikliği yok. Actions hesap engeli devam ediyor.
