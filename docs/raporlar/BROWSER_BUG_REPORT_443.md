# BROWSER_BUG_REPORT_443 — Referans listesi yanlış hazır durumu

Düzeltildi: ses üretimi sonrası liste okunamasa da Referans hazır yazılması ve eski sesin use edilebilir kalması. Beklenen yeni referans bulunmadığında seçim kaldırılır, doğru durum gösterilir.

Düzeltildi: geciken eski liste yanıtının yeni listeyi ezmesi. Refresh tokenı ve rename/use sırasında eski okumaların geçersizleştirilmesi.

İki kontrollü asenkron UI regresyonu, önceki referans testleri, locale/syntax/diff geçti; genel paket/canlı GPU denenmedi. [Devir](../devir/2026-10-16-1138.md).
