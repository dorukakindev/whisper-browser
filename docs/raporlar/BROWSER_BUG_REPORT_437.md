# BROWSER_BUG_REPORT_437 — Ses dosyalarının bulunabilirliği

Browser/oynatıcı dublaj çıktıları ve referanslar AppData içinde dağınıktı; kullanıcı Downloads/Sesler altında istemişti. Yeni Girdi/Çıktı/Ses referansları düzeni uygulandı; eski veriler silinmeden ve yeni dosyalar ezilmeden kopyalanır. Girdi üretimde kullanılan SRT kopyası ve arka plan kaynakları; Çıktı dublaj/yan dosyalar; Ses referansları kayıt kütüphanesi.

Dört hedefli test dosyası geçti; gerçek istenen Windows klasörleri oluşturuldu. Dış bağımsız VoxCPM2 stüdyosu ve harici default referans dosyaları zorla taşınmadı. [Kanıt/sınırlar](../devir/2026-10-16-0342.md).
