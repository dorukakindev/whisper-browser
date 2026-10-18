# BROWSER_BUG_REPORT_441 — Üç durum hatası

- Referans kütüphanesi100 kaydı tarihten önce kesiyordu; en yeni ses kaybolabiliyordu. Tarihten sonra sınır, deterministik105 kayıt regresyonu geçti.
- Paneli yeniden açmak kaydedilmemiş referans adını/dökümünü siliyordu. Referans başına oturum taslağı, refresh regresyonu geçti. Kalıcı kaydetme düğmeleri hâlâ gerekir.
- Eski sayfa generation'ından gelen page-zoom olayı güncel yüzdeyi bozabiliyordu. Generation/finite doğrulaması ve stale/NaN/güncel olay regresyonu geçti.

Hedefli üç test dosyası/DOM/syntax/diff geçti. Görsel düzen/GPU/kurulum değişmedi, tam paket/CI incelemesi yapılmadı. [Devir](../devir/2026-10-16-1112.md).
