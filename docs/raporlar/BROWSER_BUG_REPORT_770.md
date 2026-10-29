# Rapor770 — Stüdyoda ilk ayar okuması sahipliği

## Doğrulanan hata ve çözüm

İlk config IPC cevabı beklenirken form kilitli değildi. Aynı anda open çağrıları ayrı config isteği başlatabilir; geç cevap ilk ses/ayarları tekrar uygulayabilir. Parent122bf8fc üzerinde kontrollü bekletilen gerçek IPC ile native test `Initial config must lock edits` assert'inde exit1 verdi. Bu kapsam yeni açılış yolu; R738 iş olayları ve R740 referans yenileme ile aynı bulgu sayılmadı.

`src/renderer/text-voice-studio.js`: open artık tek promise paylaşır. İlk config tamamlanana kadar input/pick/start kilitli; ayrı TR/EN yükleme durumu vardır. Başarılı config yeniden kullanılır. Await sonrası kapalı dialogda refresh/focus yapılmaz. Başarısız config kalıcı kilit bırakmaz; form güvenli biçimde kapalı kalır ve görünür `Ayarları yeniden yükle` eylemi config'i tekrar okur. Hata üretim hatası gibi sunulmaz. Dosya seçici programatik çağrısında cfg yoksa da reddedilir. Mevcut metin/döküm/ayar kalıcılığı değişmedi; yeni IPC/bağımlılık/şema yok.

`tests/electron-text-voice.smoke.js`: opt-in initialization/failure durumları gerçek main/preload/renderer üzerinde yalnız config yanıtını geciktirir; üç açma tek IPC, kapatma/odak korunumu, kapalı hata, görünür hata, düğmeyle retry ve normal metin/ref/preset akışını doğrular. Bu kontrollü gecikme gerçek disk arızası veya GPU değildir.

## Kabul

Final native Windows `--initialization-failure` exit0/complete:true; üç config isteği (ilk kapalı hata, görünür hata, başarılı retry). Önceki success dalı tek config ile geçti. İki mevcut Node servis testi PASS; iki JS syntax ve diffcheck PASS. Sandbox Node test runner EPERM verdi; gerekli süreç yetkisiyle aynı test2PASS, başarısız deneme gizlenmedi. Var olan11before-quit listener uyarısı açık; ağ testte kasıtlı kapalı. Tam npm test/kişisel start.bat/GPU/insan ses kalitesi koşulmadı, uzun CI beklenmez.

[Hata ekranı](STUDIO770_2026-10-29/studio-config-error-tr.png), [yükleme](STUDIO770_2026-10-29/studio-initializing-tr.png), [dar125](STUDIO770_2026-10-29/studio-tr-narrow-125.png), [ölçümler](STUDIO770_2026-10-29/acceptance.json). Hata görüntüsü gerçek Windows'ta açılıp incelendi; mevcut grafit/amber komponentleri kullanılır. Bu paket tüm ürün tasarım kabulü değildir.

Mevcut referans/iş sahipliği yaklaşımı yeniden kullanıldı; W3C APG modal dialog focus rehberi (https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/) önceki ortak modal yapısıyla uyum için referanstır. Dış kod kopyası yok. P006/P092/P097/P098 sınırlı ilerleme;90aktifhedef sürer.
