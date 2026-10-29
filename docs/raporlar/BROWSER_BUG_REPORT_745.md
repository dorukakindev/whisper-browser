# Rapor745 — Gerçek DeepSeek altyazı/Whisper araç seçimi

Ürün bugı veya yeni ürün özelliği sayılmaz: R743 native uygulama adaptörünün ardından gerçek model kararını sınayan entegrasyon kanıtı. Ürün100 P003/P071/P077 kapsamını dar ama gerçek sağlayıcı kanıtıyla ilerletir.

## Yeniden üretim
Windows Electron ile `tools/assistant-deepseek-live.cjs --live-deepseek --suite captions`; tek vaka için `--case CAPTION-SAVED-RANGE`. Mevcut güvenli DeepSeek kaydı salt okunur; her istek standard katman, en fazla8HTTP/vaka ve90sn iptal. Her kayıt sentetik video/metin/aralık/profildir, gerçek video veya kişisel ayar değiştirilmez. Uygulama eylemleri yalnız kontrollü okuma ve öneri döndürür; kart uygulanmaz.

Araca beş caption vakası ve mevcut WHISPER-ONLY ile altı-vakalık suite eklendi. list_translation_profiles üretim describe() ile dummy anahtardan üretilen yalnız public profil sözleşmesini döndürür. Desteklenmeyen read araçları artık unsupportedReads olarak kaydedilir ve testin yeşil sayılmasını engeller. Public profile mock girdisi endpointPreset olarak netleştirildi; canlı koşudaki önceki girdiyle aynı iki public profil olduğu ayrıca assert edildi.

## Gerçek sonuç
[Canlı kanıt](evidence745/live-captions.json):6/6 PASS,16HTTP istek, toplam yaklaşık41sn; yeni üretim başlatılmadı.
- WHISPER-ONLY: start_whisper translate=false,start5,end25;5658ms.
- CAPTION-LOADED: captured-source-en,tr,5–25,forSpeech=true;7816ms. Whisper/probe yok.
- CAPTION-PROBE: manuel en ID, de,5–25;6779ms. Doğru probe öncesi/öneri sonrası.
- WHISPER-SPEECH-RANGE: açık Whisper talebi, translate=true,de,312–517,forSpeech=true;9004ms. Mevcut altyazı/probe kullanılmadı.
- CAPTION-NONE: boş dil listesi ardından hiçbir üretim/öneri yok;5115ms.
- CAPTION-SAVED-RANGE: açık kaynaktrack,tr,12.5–44.75;6609ms. Tüm videoya genişleme yok.

[İlk koşu](evidence745/initial-incomplete-adapter.json):5/6. Son vaka profil listesinin testte desteklenmemesinden durdu; model seçili12.5–44.75 aralığı zaten doğru ifade etti. Ürün/prompt hatası diye sayılmadı. İlk hata gizlenmedi, beklenti gevşetilmedi; gerçek read sözleşmesi eklendi. Önceden geçse de eksik read yanıtı olan vakaları son koşu yeniden doğruladı.

## Diğer kontrol ve sınırlar
Mevcut assistant-video-intent + assistant-caption-actions14 hedefli test PASS; syntax/diff PASS. Ek olarak yazılan assistant-translation-profiles.test.js yolu bulunmadı: bu adla test yok,14sonuca eklenmedi. Ayrı public-profile eşdeğerlik assert'i PASS. Yeni UI yok; görsel test bu pakette çalışmadı. Yeni bağımlılık/IPC/kalıcı ayar şeması yok. Mevcut provider ve public profile kodu yeniden kullanıldı; dış repo kodu alınmadı.

Gerçek YouTube probe/download ve renderer kart uygulaması bu araçta kontrollüdür; R743 native zinciri ayrı kanıttır, iki test tek canlı E2E sayılmaz. Canlı çeviri metni/dublaj üretimi/GPU/human kalite/BAT/personal hesabı doğrulanmadı. Model stokastiktir,6vaka tüm komutları kanıtlamaz. Uzun CI/tam npm test beklenmedi.90aktifhedef devam, müzik kapsam dışı.
