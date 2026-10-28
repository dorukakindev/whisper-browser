# Rapor732 — Ses stüdyosunda doğru hazır ayar ve dar üretim çubuğu

Kullanıcının Tkinter görüntüsüne ilişkin ortak temaya geçiş R722'de tamamlandı; yeniden yeni özellik sayılmaz. Güncel `ses-studyosu.bat` → `start.bat` → Electron `Metne ses ver` yoludur. Doğrudan eski Python Tk modülü aynı kalır; onu yenilenmiş saymıyoruz.

## Doğrulanan düzeltmeler
- `src/renderer/text-voice-studio.js`: hazır ayar düğmesi önceden yalnız tıklanınca işaretleniyor, değerler elle değişince seçili kalıyordu; kayıtlı özel ayar ilk açıldığında da açıklanmıyordu. Yeni karşılaştırma gerçek preset alanlarını izler, eşleşen düğmenin aria-pressed değerini ve tek dilde kısa açıklamayı günceller. Eşleşmeyende Özel ayarlar / Custom settings. Motor/klonlama/tohum presetin değiştirmediği bağımsız alanlardır.
- `src/renderer/text-voice-studio.css`: 600px altında çıktı adı üst satır, ana eylemler iki sütun; metin alanı ve ayarlar kaydırılabilir. Ortak grafik/amber/açık tema tokenları, klavye odak halkası kullanılır. `.media-surface button:not(.hidden)` kuralının yüksek özgüllüğü alt düğmeleri 36px'e indiriyordu; stüdyo seçicisi düzeltilip 44px tabanı korundu. `!important` eklenmedi.
- `tests/electron-text-voice.smoke.js`: kayıtlı özel ayar, preset seçimi, elle değiştirme, dil değişimi; gerçek 480 CSS px (%125) taşma, gövde yüksekliği ve üç eylemin görünür/tıklanabilir ölçümü.

## Windows kanıtı ve testler
- `node --test --test-isolation=none tests/text-voice-studio.test.js`: 2 PASS. Geçersiz ayar, Türkçe UTF-16/cp1254, iş sahipliği, iptal temizliği ve kaynak döküm korunumu mevcut kontrolleri.
- İki değişen JS `node --check`; `git diff --check`: PASS.
- Gerçek Windows Electron, ayrı profil ve sentetik WAV/TXT ile `tests/electron-text-voice.smoke.js --reference tmp/pipeline700/reference.wav --transcript tmp/pipeline700/synthetic-reference.txt --engine <kurulu motor>`: exit0. GPU üretimi seçilmedi. [Ölçümler](evidence732/acceptance.json).
- Görseller gerçekten açılarak incelendi: [TR koyu](evidence732/studio-tr-dark.png), [TR 480px](evidence732/studio-tr-narrow-125.png), [EN açık ayarlar](evidence732/studio-en-light-settings-125.png).
- İlk 600 fiziksel piksel isteği uygulamanın minimum pencere sınırı nedeniyle 752 CSS px kaldı. Testin kendi minimum boyutu indirilip width<=480 şartı eklendi; önceki koşu 480 kanıtı değildir. Bu gerçek dar koşulda düğme ölçümleri 38.67/39.73px ile kırmızı oldu. Sadece min-height artırma ortak kuralı aşamadı; seçici kök nedeni çözülünce geçti. Eşik gevşetilmedi.
- Mevcut 11 before-quit listener uyarısı sürer; dış ağ bilerek kapalı olduğundan filtre hazırlama uyarısı beklenir.

## Tasarım ve kaynak
Mevcut uygulamanın Electron dialog, media-surface ve token sistemi kullanıldı; dış repo kodu, yeni bağımlılık, lisans veya schema yok. frontend-design becerisi uygulandı. Tasarım önceliği AGENTS'de zaten kalıcıdır. Görsel/etkileşim ölçümü yalnız bu stüdyo ve seçilen ekranlardır; bütün uygulamanın kusursuz olduğu iddia edilmez.

## Sınırlar
Bu turda gerçek TTS/GPU, canlı sağlayıcı, insan kulağı kalite tercihi, tüm DPI/ekran okuyucu, OS reduced-motion ve CI/tam npm test koşulmadı. Masaüstü araç kontrolü kullanıcı tarafından durduruldu; yeniden başlatılmadı. Önceki gerçek ana start.bat denemesinde VMP doğrulaması exit0 ve Electron süreci başladı, fakat kullanıcı Esc ile durdurduğu için etkileşimli BAT/iş kabulü tamamlanmadı. İzole otomatik Electron testi bunun yerine BAT kabulü diye sunulmaz. Kişisel program/profil kapatılmadı. P094 kısmi ilerleme, 90 aktif hedef ve GPU kitap kabulü açık; müzik hedefi eklenmedi.
