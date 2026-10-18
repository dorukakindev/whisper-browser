# BROWSER_BUG_REPORT_435 — Referans ses adları

Eksik özellik: referanslar yalnız aralık/tarih adıyla listeleniyordu; kullanıcı adı girme veya yeniden adlandırma yolu yoktu.

Yeni Referans adı/Adı kaydet alanı; oluşturma öncesi opsiyonel ad, kayıt sonrası bağımsız rename. Yetkili IPC ve 1–160karakter doğrulaması; oluşturma tarihi, dosyalar ve aktif referans korunur. Görsel kontrolde genel88px input genişliği yeni ad için yetersizdi; alan esnek genişletildi. Adlar kullanıcı verisi olarak işlenir.

İlgili servis/UI/persist/locale/preload/DOM testleri ve Electron bridge geçti. Ayrı Windows Electron profilinde Türkçe isim listede ve metadata dosyasında kalıcı; ekran görüntüsü incelendi. Genel CI incelemesi kullanıcı talimatıyla yapılmadı. [Ayrıntılı devir](../devir/2026-10-15-2331.md).
