# 514 — Ses çevirisinde kaynakla eşleşmiş komşu taslaklar

Tarih: 2026-10-21. Kapsam: seslendirmeye uygun çevirinin ikinci geçişi.

## Doğrulanan eksikler ve değişiklikler

1. İkinci geçiş yalnız yerel paketin çevirisini ve komşuların kaynak metnini görüyordu. Paket sınırında sen/siz, zaman, zamir ve terim seçimini komşu Türkçe ile karşılaştıramıyordu. Artık komşu kaynak/çeviri çiftleri salt okunur **taslak** olarak gönderiliyor. Kaynak öncelikli; komşu hatasını kopyalamama ve yalnız istenen ID'leri yanıtlama talimatı var.
2. Terim adayları bütün video için ilk 24 kayda indirgeniyordu. Geç bölümlerdeki ilgili terim, girişteki alakasız adaylar yüzünden kaybolabiliyordu. Artık her gözden geçirme paketinde kaynakta geçen adaylar seçiliyor, yakın bölüm öncelikli. Aynı terimin çelişen hedef karşılıkları gizlenmiyor; ilk kayıt doğru kabul edilmiyor.
3. Yeni kalite davranışının eski tamamlanmış sonuçlarla atlanmaması için ses protokolü `speech-v6-context-review` oldu. Backend önbellek/TM/çıktı metadatası ve browser tamamlanmış iz kullanımı aynı protokolü izliyor. Normal çeviri protokolü değişmedi.

Komşu taslakları işçiler başlamadan dondurulur. Böylece gözden geçirme sırası bağlamı değiştirmez. Yalnız tamamlanmış, kaynak yankısı olmayan komşular alınır; mevcut sahne/konuşmacı sınırları korunur. Her yön en fazla 2400 kaynak+hedef karakteri taşır; en yakın bağlam tercih edilir. Ek model çağrısı yoktur; mevcut ikinci geçişin girdi token miktarı artabilir.

## Kanıt

- `backend/test_speech_translation.py`: 16 test geçti. Yeni davranış testi gerçek `llm_translate` hattını kontrollü taşıma ile çalıştırıyor: önceki grup gözden geçirilmiş olsa bile sonraki grup dondurulmuş taslağı alıyor; iki yönde kaynak/hedef eşleşmesi ve uzun sessizlikte bağlam kesilmesi doğrulandı. Terim testi 30 alakasız giriş adayının sonraki ilgili iki karşılığı gölgelemediğini doğruluyor.
- `backend/test_turkish_native_refine.py`: 3 geçti.
- `backend/test_translate_prompt_golden.py`: 6 geçti; normal çeviri altın örnekleri değişmedi.
- `backend/test_sentence_distribution.py` doğrudan çalıştırıldı: 48 geçti. Bu dosya unittest sınıfı kullanmadığı için ilk discover çağrısı 0 test buldu; başarı kanıtı doğrudan çalıştırmanın sonucudur.
- `tests/browser-youtube-whisper.test.js`, `tests/speech-translation-ui.test.js`: geçti.
- Python derleme, renderer JS sözdizimi ve `git diff --check`: geçti.

## Sınırlar

Bu çalışma modelin gerçek çıktı kalitesinin ölçümü değildir. Canlı ücretli sağlayıcı, dinlemeli A/B karşılaştırma, gerçek YouTube, GPU ve `start.bat` yeniden açılışı çalıştırılmadı. Yeni UI veya bağımlılık yok. Kullanıcı dosyaları değiştirilmedi. Kelime anlamı ve duygunun doğruluğu mekanik kontrollerle garanti edilemez; mevcut sayı/olumsuzluk/ID korumaları ve kötü gözden geçirmede ilk çeviriye dönüş sürüyor.
