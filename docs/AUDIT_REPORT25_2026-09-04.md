# 25 maddelik yeni rapor — doğrulama durumu

Kaynak: `75f6c05c-35b2-4f94-8019-2a0c9a5ddd49/pasted-text.txt`.
Numaralar yalnız bu rapora aittir; eski BUG-* numaralarıyla karıştırılmamalıdır.

## Düzeltilenler

- 4: `strip_html`, sayısal karakter referanslarını siliyordu. Etiketler çıkarıldıktan sonra standart `html.unescape` ile tek geçişte çözülüyor. Türkçe ondalık/hex referanslar, named entity, kaçışlı düz metin ve çift çözmeme test edildi.
- 7: Klip fallback araması dosya adını glob deseni olarak yorumluyordu. Literal önek ve medya uzantısıyla dosya araması yapılıyor. Köşeli parantezli ad, `.part` ve dizin dışlama testi gerçek geçici dosyalarla çalıştırıldı.
- 10: `parse_timecode` sonlu olmayan bileşenleri ve hesaplama taşmasını kabul ediyordu. NaN, Infinity, negatif bileşen ve taşma reddediliyor; normal zaman girdileri korunuyor.
- 23: YouTube ses indirmesinde mevcut olmayan fallback dosya yolu başarı sayılıyordu. Dosya kontrolü eklendi; sahte yt-dlp ile hata davranışı test edildi, ağ çağrısı yapılmadı.

## İddia edildiği biçimde doğrulanmayan

- 8 ve 9: `allocUnsafe` son baytı yazılmadan bırakıyor; ancak Node `toString('utf16le')` eksik son baytı yok sayıyor. Farklı son bayt değerleriyle çıktı değişmedi. Bu bulgu mevcut yürütme yolunda bellek verisinin kullanıcı metnine sızdığını kanıtlamıyor. İstenirse ayrı savunmacı temizlik yapılabilir; kritik sızıntı diye sayılmadı.

## Açık inceleme

1–3, 5–6, 11–22 ve 24–25 henüz bağımsız doğrulanmadı. Bu rapor tamamlandı veya bütünüyle düzeltildi sayılmamalıdır. Önceki açık işler `AUDIT_TUR3_PROGRESS_2026-09-04.md` içinde korunuyor.

Yeni testler `backend/test_transcribe.py` içinde. Python alt grubu 129/129 geçti; gerçek Electron, GPU/model veya sağlayıcı oturumu bu testlerin kapsamına dahil değildir.
