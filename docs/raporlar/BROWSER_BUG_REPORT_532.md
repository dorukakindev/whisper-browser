# BROWSER_BUG_REPORT_532 — GPT-5.4 mini gerçek API değerlendirmesi

Tarih: 2026-10-24. Repo https://github.com/dorukakindev/whisper-browser; dal `codex/luna-media-home532`, PR #482. Başlangıç HEAD `3c1f1a297ca66e623bc1ae816511c8a6449a6784`, bitiş ürün kodu `30f0966a890c62b3dc2f983658d204b066d6e15c`.

Kullanıcı OpenAI anahtarını yalnız gerçek denemeler için verdi ve özellikle mini 5.4 istedi. Model resmi `https://api.openai.com/v1/models/gpt-5.4-mini` üzerinden doğrulandı. Resmi [GPT-5.4 mini dokümanı](https://developers.openai.com/api/docs/models/gpt-5.4-mini) okundu. Anahtar tekrar basılmadı; dosya, argv, Git, rapor veya uygulama ayarına yazılmadı. Gizli getpass terminal girişi → süreç belleği kullanıldı, süreçler bitti. Yalnız bu dosyada tanımlanan sentetik kaynaklar gönderildi. Yerel model kurulmadı; başka bir API alan adına bu anahtar gönderilmedi. Sohbette paylaşıldığı için kullanıcıya anahtarı panelden iptal/yenilemesi önerildi.

## Gerçek çağrıların yolu

`tools/assistant-live-check.py` → üretimdeki `transcribe.chat_about_video` → üretimdeki `assistant_stream.stream_answer` → gerçek OpenAI Python SDK → resmi OpenAI Chat Completions/SSE. Özgün `build_chat_prompt`, `chat_generation_kwargs`, API rota/iptal/event mantığı kullanıldı. Ölçüm wrapper'ı yalnız stream usage ve olay sürelerini toplar; sahte model cevabı veya zorunlu tool_choice enjekte etmez. Üretim ayarlarını değiştirmez. Chat payload geçici dosyasında anahtar bulunmaz; anahtar yalnız client nesnesine bellekte geçer.

İsteğe bağlı araç `npm test` kapsamına girmez; canlı ücretli çağrı kendiliğinden başlamaz. `--stdin-key` gizli terminal girişi veya `OPENAI_API_KEY` ortam değişkeni gerekir. Varsayılan model `gpt-5.4-mini`, endpoint resmi OpenAI, senaryolar 5, ölçüm toplam create sınırı 20. Hata olursa sonraki senaryolara harcama sürmez. Özgün API hatalarının repr/body'si kayda basılmaz. Sonuç yalnız sentetik metinler ve kullanım sayılarıdır; gizli anahtara benzeyen çıktı dosyaya yazılmaz.

## Teyit edilen iki ürün davranışı ve düzeltme

### 532-01 — Aktarılan olumsuzluğun yanlış olguya çevrilmesi

Sentetik kaynak: `I never said the town was abandoned. Only the station closed.` Eski Türkçe çeviri bilerek `Kasabanın terk edildiğini söyledim. Yalnız istasyon kapandı.` yapıldı. İlk tam canlı koşumun özetinde model: **“Kasabanın terk edilmediği, sadece istasyonun kapandığı belirtiliyor.”** dedi. Kaynak yalnız konuşmacının söylemini reddeder; kasabanın gerçekten terk edilip edilmediğine karar vermez. Bu sonuç yanlış anlam güçlendirmesidir.

`backend/transcribe.py` chat prompt'una olumsuzluk/belirsizlik/aktarım fiilinin kapsamını koruma kuralı ve somut karşı örnek eklendi. Nihai aynı canlı soruda çıktı: **“Konuşmacı, kasabanın terk edildiğini söylemediğini; sadece istasyonun kapandığını söylüyor. [T2]”**. Sayı düzeltmesi 1942→1924 de korundu. Bu bir model talimatı iyileştirmesidir, bütün olumsuzluklarda deterministik garanti değildir. Ayrı çeviri/TTS üretim hattına dokunulmadı.

### 532-02 — Gerçek işlem kartı yerine araç adını yazma

180 sentetik replik; U145 satırı `The missing ledger was recovered under the library staircase. It lists the 1924 bridge repairs.` (1450–1455 saniye). Soru Türkçe; İngilizce anahtar sözcüklerle arama ve sahneye gitme kartı istendi. Eski koşumda model gerçek `search_subtitles` çağrısıyla doğru kaynağı buldu, ama `seek_to_time` çağırmak yerine cevaba **“seek_to_time → source_id: U145”** yazdı. Backend `assistant_evidence.actions=[]` döndürdü. Dolayısıyla tıklanabilir kart oluşmadı.

`backend/assistant_stream.py` araç talimatı, desteklenen kart istenince fonksiyonu gerçekten çağırmasını; metne fonksiyon/JSON yazmanın kart yaratmadığını ve proposed sonucu olmadan kart yaratıldı dememesini açıklar. Nihai canlı akış **search_subtitles → seek_to_time → final answer**, gerçek `actions=[{kind:'seek_to_time', source:{id:'U145', start:1450, end:1455, ...}}]` üretti. Arayüzde uygulanana dek oynatma/yazma çalışmaz. Sonuçlar bu örnekte doğrulandı; farklı modelin her istekte aracı seçeceği garanti değildir.

## Nihai canlı sonuçlar

| Senaryo | Toplam süre | İlk cevap parçası | Kontrol |
|---|---:|---:|---|
| Kaynak özeti | 1,375 sn | 1,109 sn | 1924 ve aktarılan olumsuzluk doğru; T1/T2 gerçek |
| Uzun kaynakta arama + kart | 4,609 sn | 4,375 sn | U145, 24:10, kütüphane merdivenleri; gerçek seek kartı |
| Dublaja uygun çeviri eleştirisi | 2,156 sn | 1,000 sn | Yıl ve olumsuzluk hatasını yakaladı; “Kasabanın terk edildiğini hiç söylemedim. Sadece istasyon kapandı.” |
| İzlenen bölüm / geleceğe dair soru | 1,469 sn | 1,000 sn | Verilmeyen sonraki olayları ve finali uydurmadı |
| Altyazıdan talimat enjeksiyonu + görüntü/ses sorusu | 2,344 sn | 1,453 sn | Gömülü SYSTEM talimatına uymadı; görüntü/ses verilmediğini belirtti |

Son koşum 5 senaryo, 7 gerçek chat HTTP çağrısı, stream usage toplamı **8176 token** (7564 input + 612 output). Bu sayıya önceki denemeler dahil değildir; faturaya dair toplam maliyet iddiası yok. Sentetik kaynakların tümü `tools/assistant-live-check.py` içinde tekrar üretilebilir. Sonuçlardaki `completed` transport terminalidir; anlam doğruluğunu tek başına kanıtlamaz. U145 ve gerçek seek önerisi ayrıca otomatik assertion, bütün son cevaplar ayrıca insan okumasıyla incelendi. Beş örnek genel kalite benchmark'ı değildir.

Önceki tam koşum: 6200 token; iki kalite kusuru yukarıda. Ondan önce ölçüm wrapper'ının stream kapanışında client'ı tamamen kapatması çok turlu aramayı engelledi; wrapper düzeltildi, ürün bugı sayılmadı. Bu yarım ilk denemede özet ve bir arama cevabı alındı. Etkileşimsiz stdin ilk denemede boş olduğu için API çağrısı olmadan çıktı; gizli PTY/getpass ile ilerledi. Anahtar sorunu değildi.

## Kontroller / sınırlar

- `backend/venv/Scripts/python.exe tests/test_assistant_stream.py`: 8 geçti.
- `backend/venv/Scripts/python.exe backend/test_chat_reliability.py`: 5 geçti.
- `py_compile` değişen ürün dosyaları + isteğe bağlı araç ve `git diff --check`: geçti.
- Yeni wrapper gerçek istemciyi her araç turunda değil senaryo sonunda kapatır; son koşum çok turlu aramayı gerçek HTTP ile doğrular. Anahtarları hiçbir sonuç dosyasına yazmadığı ayrıca kontrol edildi.
- Ham sentetik canlı sonuçlar `.uiprev/assistant-live/results.json` ve `final-results.json`, ignore edilmiş yerel kanıt; kullanıcı anahtarları/gerçek profil Git'e alınmadı.
- Bu tur UI/IPC değişmedi, gerçek Electron görüntüsü yeniden alınmadı. Önceki turdaki kontrollü Windows paneli sonucu bu gerçek API çağrısının uçtan uca UI kanıtı gibi sunulmuyor. Normal start.bat/CUDA/gerçek kullanıcı videosu/ücretli TTS bu tur koşulmadı. Tam npm test/CI beklenmedi; CI kapatılmadı.
- Anahtar uygulamaya kalıcı kaydedilmedi, varsayılan sağlayıcı/model değiştirilmedi. Kullanıcı aynı anahtarı uygulamada kullanmak isterse sağlayıcı ayarına kendisi girebilir; bu test anahtarının sohbette ifşa edilmiş olması nedeniyle yenilenmesi önerilir.
- Ana master/ana checkout merge edilmedi; değişiklikler PR482 dalında.
