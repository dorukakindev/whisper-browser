# Rapor555 — Büyük harfli konuşma repliklerinin çevrilmeden kabulü

2026-10-25 07:01 Europe/Istanbul. Repo https://github.com/dorukakindev/whisper-browser; codex/book-reliability549/PR487. Başlangıç3103c326fd021a484717beda2158269f083d5f37; ürün bitiş **a076b1ab9b5f8047715caa2c5da2204282fa0ce4**.

`backend/transcribe.py` line_keeps_source iki tam-büyük kelimeyi kurum/kod saydığı için THANK YOU API'ye gitmeden korunabiliyordu. translation_is_source_echo, Title Case çok-kelimeyi özel ad saydığı için Thank You aynen dönen cevabı başarılı sayabiliyordu. Var olan kısa çevrilebilir replik kümesi bu iki harf-biçimi istisnasından önce uygulanır. Yeni sözcük listesi/heuristik eklenmedi; New York/NASA ESA/Boeing747/COVID-19 özel ad/kod istisnaları korunur. Normal ve ses için çeviri ortak kapısı düzelir; kullanıcıya modelin İngilizce kopyası Türkçe başarı diye sunulmaz.

`backend/test_speech_translation.py`: Title/UPPERCASE selamlama ve emir replikleri; özel ad/kod negatifleri; sahte sağlayıcının hem uzun cümleyi hem Thank You/THANK YOU metnini aynen döndürdüğü tam speech hattı completion=[]/failed=[0]/source_echo verir. Önceki uzun cümle örneği korunur, test silinmez.18speech testi PASS,5anlam korpusuPASS,3sayı kapısıPASS; mevcut iki kaynak-yankısı/kurtarma fonksiyonu ayrıcaPASS. py_compile ve diff geçti. Gerçek model/API çağrısı yok; bu kapı doğruluğu kanıtıdır, genel çeviri kalitesi iddiası değildir. Kaynak-dil/aynı-dil kararı ve proper-name sezgilerinin tüm belirsizlikleri bu küçük düzeltmeyle çözülmüş sayılmaz.

UI/kurulum/dependency/şema değişmedi; kişiselstart.bat/GPU/YouTube/CI beklenmedi. Yedek bakım paketi yapılmadı; master'a merge yok. Sonraki odak: sıcak motor süreç/oturum sahipliği ve son-parça bekleme, mevcut raporların kesin çözüldüğünü varsayma.
