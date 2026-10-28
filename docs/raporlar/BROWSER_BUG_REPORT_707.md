# Rapor 707 — Asistan ayar kartında gerçek önce/sonra farkı

Başlangıç master `4901148f80de623b02f9d704370691f4d272d4f9`. Yeni kullanım geliştirmesi; eski kayıt/geri alma mekanizması bozuktu iddiası yok.

## Değişiklik

Asistan configure_workflow kartı, önerilen değeri tek başına göstermek yerine ana sürecin mevcut renderer'dan okuduğu güvenilir snapshot ile **önce → sonra** gösterir. Modelin söylediği eski değer kullanılmaz. Seçmeli kontrollerde gerçek seçenek etiketi, boolean için Açık/Kapalı veya On/Off, değişmeyen değerde açık unchanged/değişmiyor notu vardır. Her alan ayrı satırda; mevcut kartın kaydırma/sarma ve onay görünümü kullanılır.

Snapshot'ta değiştirilmesi istenen alanın mevcut değeri yoksa veya türü geçersizse kart hazırlanmaz. Uygulamadan hemen önce mevcut state ile kartın snapshot eşitliği kontrolü zaten vardı; korunur. Yan etkisiz ayar okuma, yetkili whitelist, değer sınırları, kayıt sonrası gerçek readback, kayıt başarısızlığında sahipli rollback ve bayat kart reddi değişmedi. API anahtarı/uç nokta modele veya özete eklenmez.

## Kanıt

- 36 hedefli Node testi PASS: yeni summary before/after, seçenek etiketi, boolean TR, unchanged, eksik/NaN current değeri reddi; main eksik current alanında sıfır kart; önceki state değişince apply reddi; mevcut kayıt/undo/rollback/scope kontrolleri.
- Native Windows gerçek renderer/main/preload/asistan overlay + fixture sağlayıcı: standard tier,18 kontrollü çağrı,4 uygulanmış kart; model large-v3→tiny ve beam5→3 gerçek ayarlarda/diskte doğrulandı. Altyazı/speech ayarı, geri alma ve elle değişmiş kartın reddi PASS; üretim başlamadı.
- TR koyu kartta iki gerçek fark görsel olarak incelendi. EN açık yeni kartta base→tiny ve3→3(unchanged) görüldü. Model yanıtı ve önceki sohbet metinleri kullanıcı içeriği olarak kendi dilinde korunur.
- Syntax/diff PASS. [Kanıt](SETTINGDIFF707_2026-10-28/native.json). Kişisel anahtar/profil/kütüphane kullanılmadı.

## Kaynak ve sınırlar

[AI SDK resmî araç çağırma/onay dokümanı](https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling) tool input/result ve uygulama kontrollü approval ayrımı incelendi. Yeni SDK eklemek yerine mevcut trusted renderer snapshot + main action kartı altyapısı geliştirildi. Dış kod kopyası/yeni bağımlılık/IPC/kalıcı şema yok.

Yeni before/after özeti configure_workflow içindir; undo kartının ters farkı bu pakette eklenmedi (mevcut undo işlevi native doğrulandı). Bu nedenle P073 tam kapsamı kısmi. P072 bağlı gizli olmayan ayarların değiştirmeden önce okunması mevcut-doğrulandı. Bütün uygulama ayarları veya gerçek model tool-choice başarısı iddiası yok. Canlı DeepSeek/ücretli API/GPU/start.bat/install/DRM yok.11before-quit uyarısı açık; fixture ağ izolasyonu reklam filtre isteğini engelledi, reklam kabulü sayılmadı. CI beklenmedi.
