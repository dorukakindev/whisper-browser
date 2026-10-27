# Yerel Claude Code / DeepSeek için test görev paketi

Bu paket yalnız görev belgeleridir; kaynaklar D:\Whisper Local içinde zaten var. Başlatıcıya/config'e dokunulmadı. .cmd yalnız PowerShell sarmalayıcısı olarak okundu; gerçek model ayarı veya kimlik bilgileri incelenmedi.

## En kolay kullanım

Mevcut DeepSeek-Baslat.cmd ile açtığın Claude Code'a şunu yapıştır:

> D:\Whisper Local\docs\denetim\deepseek-2026-10-27\BASLA.md dosyasını oku ve uygula. 01–06 görevlerinin tamamını sırayla derinlemesine denetle; yalnız plan çıkarıp durma. Ürün ve mevcut test kodunu değiştirme, düzeltme/commit/push/merge yapma. Kendi probe/fixture/raporlarını yazabilirsin. İlgili testleri çalıştır, önemli yeni sınır ve yarış senaryolarını dene. Her görev sonunda checkpoint kaydet, devam onayı beklemeden sıradakine geç. Çalıştırılamayan her şeyi gerekçesiyle belirt; fixture başarısını gerçek model/GPU/canlı site başarısı sayma. Sonunda kanıtlı raporları ve yeniden üretimleri tek teslim ZIPinde ver. Dosyadaki ortak kurallara uy.

İstersen altı ayrı sohbete yalnız birer görev dosyası verebilirsin; her dosyada global kuralların tamamı vardır. Her sohbet benzersiz çıktı klasörü kullanır. Tek makinede çakışan native/GPU/tam suite işleri paralel başlatma; varsayılan tek sohbette sırayla çalışmaktır. Launcher ayarını değiştirmene gerek yok.

## İçerik

- [01-ASISTAN-ARAC-KOMUT-BAGLAM.md](01-ASISTAN-ARAC-KOMUT-BAGLAM.md): Asistanın gerçek komut ve bağlam sözleşmesi — 12 başlık.
- [02-CEVIRI-WHISPER-DUBLAJ.md](02-CEVIRI-WHISPER-DUBLAJ.md): Anlam, zaman ekseni ve ses bütünlüğü — 12 başlık.
- [03-KITAP-PDF-OKUYUCU.md](03-KITAP-PDF-OKUYUCU.md): Okuyucu, asistan ve sesli kitap — 12 başlık.
- [04-KESFET-KATALOG-LETTERBOXD.md](04-KESFET-KATALOG-LETTERBOXD.md): Keşfet, yorum ve kişisel medya verisi — 12 başlık.
- [05-BROWSER-REKLAM-TASARIM.md](05-BROWSER-REKLAM-TASARIM.md): Browser yaşam döngüsü ve tasarım — 12 başlık.
- [06-IPC-SUREC-DOSYA-SINIRLARI.md](06-IPC-SUREC-DOSYA-SINIRLARI.md): IPC, dosya ve süreç sınırları — 12 başlık.

GLOBAL-KURALLAR.md ortak sözleşmedir. TEMPLATE-FINDINGS.json örnek alanları açıklar; örnek bug değildir. SNAPSHOT.json gerçek revizyon ve kirli dosya kimliğini taşımalıdır. Bu paket yazılırken ürün testleri yeniden koşulmadı; belge/link/JSON/ZIP bütünlüğü doğrulandı. Rapor629 önceki ürün tesliminin kanıtıdır, bu denetimin sonucu değildir.
