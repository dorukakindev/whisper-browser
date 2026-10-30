# Rapor804 — Ürün100 P11–P20 konuşma çevirisi karşılaştırması

Başlangıç master `850d85a4cd82f00040bff5185a232a777242ede5`; bitiş ürün kodu `760e5e75645820b00fb7bb89f92ad0b13c49863f`. Dal `codex/product50-translation804`. Kullanıcı hedefi100 yaptı; kanonik liste [PRODUCT100](PRODUCT100_2026-10-30.md). İlk20 adayda14 ürün hedefi geliştirildi,6 mevcut bulundu;80 aday sürüyor. Bunlar20 yeni bug değildir.

## Değişiklik ve kullanım

- P11/P12: karşılaştırmada yalnız değişenler veya sayı eksilmesi şüphesi filtreleri; sayaç/sayfalama filtrelenmiş listeyi kullanır. Aynı metin dosyaları değiştirilmez.
- P13/P14: Kaynak/normal/seslendirme dosya rolleri ve dosya adları ayrı görünür. Alt+←/→ diyalog içinde sayfalar; input/repeat durumunda çalışmaz.
- P17: sayı, ad, kip, olumsuzluk reddinden sonra mevcut fallback/rescue isteğine statik ve dar onarım rehberi eklenir. Nedeni bilinmeyen provider metni prompta aktarılmaz. Yeni istek veya kalite eşiği gevşetmesi yok.
- P18: düzenleyici kayıtlı telaffuz sözlüğünün konuşma metnine etkisini gösterir. Bu sayı-normalizasyonunun tamamı değildir; açık etiketle yalnız kayıtlı sözlük önizlemesidir. Altyazı korunur.
- P19: seçili zaman aralığı aktif altyazı aralığıyla gerçekten aynıysa kökeni açıklanır. Kullanıcı elle değiştirince açıklama kalkar; manuel aralık ezilmez.
- P15/P16/P20: kalan çeviri sayacı, kaynak metni kısmi çıktıda koruma ve yanlış kaynak hash'iyle plan uygulamasını reddetme zaten vardı. Yeni özellik diye sayılmadı. R802 gerçek ilk kısmi çıktı ve sourceHash hedefli regresyonu kanıttır.

## Kök neden ve sınırlar

Karşılaştırma her satır için tüm dosyayı tarıyordu; başlangıç sıralı indeks ve prefix maksimum bitişle örtüşme sorgusu yapılıyor. İlk5000 cue,64 örtüşen cue ve8192 karakter sınırları açık uyarıyla gösterilir. Sınırda eksik metin kesin çeviri hatası diye etiketlenmez. Uzun cue erken başlayıp geç biterse indeks onu kaybetmez. Bu bir anlamsal kalite modeli değildir; sayı farkı dilsel biçim dönüşümü olabilir.

Backend retry yalnız genel tekrar talimatı kullanıyordu; gerçek `part_kapisi_sayi_kaydi:0` reddi artık statik quantity rehberine eşlenir. İlk yeni test bu gerçek protokol adını açığa çıkardı; alias buna göre düzeltildi. Kayıtlı telaffuz Node/browser ortak Unicode sınırlarıyla, uzun anahtar önce ve birbirine zincirlenmeden uygulanır.

## Dosya amaçları

- backend/sentence_translation.py: güvenli statik retry rehberi; backend/transcribe.py: mevcut retry/rescue bağlantısı.
- src/dub-pronunciation.js: Node/browser ortak sözlük önizlemesi.
- src/renderer/dub-experience-model.js: indeks/karşılaştırma; dub-experience-ui.js: filtre/ad/kısayol.
- src/renderer/dub-generator-ui.js: sözlük ve aralık kökeni; index.html: self script; media-experience.css: temalı/dar düzen.
- tests/translation-comparison804.test.js ve backend/test_translation_feedback804.py: davranış regresyonları; electron-dub-experience795.smoke.js: gerçek Windows etkileşim/PNG.

## Doğrulama

11 Node geçti: `node --test --test-reporter=spec tests/translation-comparison804.test.js tests/dub-generator-ui.test.js tests/dub-service.test.js tests/assistant-voice-actions.test.js`.
33 Python geçti: `PYTHONPATH=backend` ile `python -m unittest backend.test_translation_feedback804 backend.test_speech_guard802 backend.test_speech_translation`.
6 JS syntax,3 Python compile ve diff kontrolü geçti. İzole gerçek Windows Electron `--experience801 --compare804`12 PNG üretti; EN/TR karşılaştırma görüntüleri gözle incelendi ve evidence804'e SHA256 ile eklendi. Rol/ad, filtre, sayfalama, input kısayol koruması, önizleme ve manuel aralık doğrulandı.

İlk native denemede change yerine input olayı kullanılması ve ikinci dil fixture'ının önceki manuel aralığı taşıması test düzeneğinde düzeltildi. Ürünün manuel aralık koruması gevşetilmedi. Önceden var11 before-quit listener uyarısı ve izole profil filtre ağ hatası gizlenmedi. Bu pakette yeni gerçek GPU veya canlı API çağrısı yapılmadı; kontrollü HTTP transport testi model kalitesi kanıtı değildir. Tam npm/uzun CI beklenmedi. Yeni bağımlılık/kalıcı şema yok; start.bat ve kişisel uygulama değiştirilmedi.
