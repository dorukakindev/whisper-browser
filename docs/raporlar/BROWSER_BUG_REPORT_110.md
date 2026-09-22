# BROWSER_BUG_REPORT_110 — SDH işaretleri, master kabulü

Tarih: 2026-09-23. Taban: `origin/master` @ `d81d48f1a1b12982b611e48c1ed705d460e4d306`. Durum: R110-01 düzeltildi; yalnız hedefli regresyonlar çalıştırıldı.

## R110-01: farklı SDH işaretlerinin tek sayı olarak sayılması

`backend/subtitle_sdh.py` içindeki eski `restore_sdh_markers`, hedefteki tüm köşeli/parantezli işaretlerin sayısını kaynak SDH işaretlerinden düşüyordu. Kaynak `[music] [applause] Thank you.`, hedef `[müzik] Teşekkürler.` iken eski sonuç `[music] [müzik] Teşekkürler.` idi: müzik çiftleniyor, alkış kayboluyordu. Ters örnek `[alkış]` tesadüfen doğruydu. İşlev `backend/transcribe.py` çeviri çıkışında çağrılıyor.

Eski yerel rapordaki `[GUNFIRE] (glass shatters)` örneği geçersizdir: SDH tanıyıcısı bu etiketleri çıkarmadığından veri kaybının kanıtı değildir.

`7e2781c82d15f4a858ae32c8ebe9d2cbcf3d16fd` kod commit'i, parantez türü ve doğrulanmış müzik/alkış eşdeğerliğiyle eşleştirme yapar; belirsiz hedef etiketin kaynak işaretinin yerine sessizce geçmesine izin vermez. Hedefli `backend/test_subtitle_sdh.py` 8/8, mevcut `test_sdh_markers_restored_after_strip` sözleşme testi geçti. Gerçek sağlayıcı/video çıktısı ve tam test paketi bu aktarımda çalıştırılmadı.

Sınır: Eşdeğerlik sözlüğü sınırlıdır; güvenilir eşleşme yoksa özgün kaynak etiketi korunur.
