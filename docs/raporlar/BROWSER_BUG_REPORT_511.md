# Rapor 511 — Gerçek ses çevirisi çıktısı ve tam cümle bağlamı

2026-10-21. Kullanıcının belirttiği kaynak, Türkçe partial çıktı, iki yedek ve düşük güven kaydı yerel olarak okundu. Ham içerik, özel yollar ve çıktı dosyaları Git'e eklenmedi.

## Doğrulanmış gözlemler

- Kaynak ve hedefte 66 blok, son zaman 299,620 saniye. `.partial` adından tamamlanma durumu çıkarılamaz; burada bütün kaynak konumlarında Türkçe metin var.
- Kaynak ve çeviri yedekleri, parse edilmiş metin/zaman bakımından güncel dosyalarla aynı. Daha iyi bir çeviri yedekte bulunmadı.
- Türkçede yüklemden sonraki kısa bloğa nesne bırakılmış; devam cümlelerinde bozuk söz dizimi ve teknik kavram için iki farklı alanın karşılığı kullanılmış. Bütün çıktı anlamsız değil; sorunlar gerçek ve özellikle sesli okumada belirgin.
- Düşük güven dosyası yalnız üç özel ad tanıma uyarısı içeriyor. Bu uyarılar Türkçe söz dizimi ve teknik terim hatalarının açıklaması değil.

## Kodda nedenler ve düzeltme

1. **Görsel altyazı sınırları konuşma çevirisini bölüyor.** Önceki 12 saniye/280 karakter sınırı bu kaynakta 44 grup oluşturuyor; ilk tam cümle üç gruba ayrılıyor. Gruplar arası yeniden sıralama yasak olduğundan Türkçe tüm cümleyi doğal kuramıyor. Yalnız speech modunda 40 saniye/1200 karakter/12 blok sınırı kullanılıyor: kaynakta 35 grup, ilk cümle tek grup. Konuşmacı, boşluk, SDH, örtüşme ve bozuk zaman korumaları aynı. Sınırsız paragraf veya sahne birleştirme yok; olağan çeviri değişmedi.
2. **İstem çelişkisi.** Doğal Türkçe söz dizimi istenirken yüklemin sonraki ID'ye taşınması da yasaklanıyordu. Speech istemi, aynı grup içinde yüklemi sona koymaya izin veriyor; nesneyi yüklemden sonra yetim bırakmama talimatı açık. Sayı/ad/SDH sahipliği, boş olmayan ID ve tam-cümle/parça eşitliği kapıları korunuyor.
3. **Partilerde konu anlamı.** Otomatik sözlük yalnız özel ad adayları çıkarıyor; küçük harfli teknik kavramlar için film geneli hedef sözlüğü oluşturmuyor. Speech isteklerine ilk en fazla 12 bloktan 1200 karakterlik salt okunur kaynak konu bağlamı eklendi. Yerel sahne/konu öncelikli; bağlam talimat veya ek çeviri değil. Bu bir terminoloji garantisi değil; güvenli bağlam iyileştirmesi. Kaynak bağlamı cache ve TM kimliğine dahil.

Speech protokolü `speech-v4-sentence-context`. Backend cache/TM/resume ve browser iz yeniden kullanımı aynı sürüme geçti. Eski dosyalar silinmez; yeni speech isteği yeniden çeviri yapabilir. Ek ücretli düzeltme geçişi açılmadı.

## Kullanıcıya yerel çıktı

Tam Türkçe metin kaynakla karşılaştırılarak editoryal olarak düzeltildi; model yeniden çalıştırılmış gibi sunulmadı. İki ayrı yeni UTF-8 BOM SRT kullanıcının aynı çıktı klasörüne kaydedildi:

- `.tr.duzeltilmis.srt`: 66 özgün ID ve zaman kodu aynen korunur.
- `.tr.duzeltilmis.ses.srt`: aynı düzeltilmiş metin, cümle gruplarında 35 blok. Başlangıç/bitişler kaynak grup uçlarıdır; mikro parçalar tek seslendirme girdisi olur. Yeni ses/WAV üretilmedi.

Beş orijinal dosyanın SHA-256 değerlerinin değişmediği doğrulandı. Çıktılar ve denetim betiği yalnız ignored `tmp/report511` ve kullanıcı klasöründe; Git dışında.

## Kanıt ve sınırlar

- `backend/test_speech_translation.py`: 8 kontrol geçti; uzun düşünce, sınır/konuşmacı koruması, bağlam/kota/cache, metadata ve tek geçiş.
- `tests/browser-youtube-whisper.test.js`: geçti; yeni protokol yeniden kullanım sözleşmesi.
- Python py_compile, renderer JS syntax, `git diff --check`: geçti.
- Prompt golden 6, sentence-distribution 48 ve docs-index kontrolleri geçti.
- İlk unittest çağrısı yanlış çalışma dizininden modül bulamadı; doğrudan dosya çağrısıyla düzeltildi. Ürün hatası veya başarısız testi gizleme yok.
- Canlı sağlayıcıyla yeni çeviri, yeni TTS/GPU üretimi, gerçek YouTube, start.bat/UI koşumu ve tam npm paketi çalıştırılmadı. Kontrollü taşıma testi model Türkçesinin başarı kanıtı değildir. CI açık, teslimi bekletmez. Ürün değişikliği PR dalında; master'a birleştirilmedi.
