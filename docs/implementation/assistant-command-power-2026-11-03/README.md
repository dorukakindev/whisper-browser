# Asistan komut gücü — 2026-11-03

Başlangıç master `2313a2346e484ed68d3caeee4d88b90eb3c01314`.
Ürün commit `fd195f5b28ec250e75598fc1205c19290f08b007`; dal `codex/assistant-command-power`.

## Kullanım
Mevcut asistan panelinden doğal dille istenir; yeni ayar/kurulum yok.
- “İzleme listemde 2000–2020 arası, 100 dakikadan kısa filmleri bul; toplam kaç tane var?”
- “1,25 hızla ve toplam10dakika molayla ne kadar kaldı?”
- “Bu ekranda hangi işlemleri yapabilirsin? Çeviri için ne eksik?”
Bu cümlelerin gerçek DeepSeek tarafından araçlara doğru çevrildiği bu turda canlı sınanmadı; aşağıdaki araç bağlantıları ve sonuçlar kontrollü sağlayıcıyla doğrulandı. Tüm program denetimlerinin bağlandığı iddiası yok.

## Koşullu gerçek katalog sorgusu
`query_media_library` kendi kayıtlı katalog snapshot'ında AND koşulları uygular. Tür (film/dizi), yıl, dakika cinsinden süre, izleme durumu, kişisel tepki, kişisel/IMDb puanı desteklenir. Aralıklar gte/lte, eşitlik eq, seçenek kümesi in ile ifade edilir; OR/ham kod/SQL/yol ve bilinmeyen alan kabul edilmez. Tam metin/tür etiketi filtresi bu araçta yok; mevcut arama araçları korunur.

Tek katalog okumasındaki aynı projection hem listeyi hem kesin toplamı hesaplar. Eksik metadata eşleşme sanılmaz: unknown, excluded, inspected, missingByField/unknownByField ve güvenle adreslenemeyen kayıt sayıları ayrı döner. Başlık ve catalog:<id> sonraki mevcut araçlarla kullanılabilir; yol, not veya gizli ayar döndürülmez. Sayfalar en fazla20kayıt; devam argümanında snapshot_revision vardır. Kayıtlar değişirse eski sonuçla sayfalama reddedilir, ilk sayfadan sorgu yenilenir. Fingerprint yetki veya kriptografik kimlik değildir. Tüm internet veya Keşfet kataloğunun toplamı olduğu iddia edilmez.

## Kaynağa bağlı süre hesabı
`calculate_playback_time` yalnız açık/görünür yerel oynatıcı veya tam tab/generation/mediaId ile bağlı browser kaynağının ölçülen süre/konum/hızını okur. İstenen speed .25–4, break_minutes0–240. Kalan medya saniyesi, hızla duvar süresi ve toplam mola dahil süre ayrı; mevcut hızı/oynatmayı değiştirmez. Model konum/süre sağlayamaz. Reklam, eski medya, canlı/bilinmeyen süre veya geçersiz konum için unsupported döner. Son okuma sırasında kaynak/sohbet değişirse sonuç reddedilir. Bitiş saati/zaman dilimi uydurulmaz; duraklatılmış içerik için sürekli oynatma varsayımı açık verilir.

## Gerçek eylem envanteri
`get_action_options` mevcut typed registry ve workspace flag'lerinden kullanılabilir araçları sayfalar; alan/sorgu ile daraltılır. Gerekli üst düzey argüman adları, read/proposal politikası, onay gereksinimi ve doğrulama için okunacak mevcut durum araçları döner. Listeleme çalıştırma değildir; readiness.verified=false açıkça korunur. Flag'in raporlanmaması gerçek dosyanın eksik olduğu kanıtı sayılmaz. Bilinmeyen workspace tüm stüdyo araçlarına düşmez. SRT/referans seçimi için get_voice_status gibi gerçek sahibi okunur; anahtar, dosya yolu veya ham şema model envanterine açılmaz.

## İnceleme sırasında onarılan sonuç doğruluğu
Main IPC yalnız completed/accepted/failed kabul ettiğinden yeni unsupported gerekçesi “Invalid application result” ile kayboluyordu. Bütçe/sender/owner korumaları korunarak unsupported geçişi eklendi; ledger bu sonucu completed yerine failed gösterir ve toplam başarısız sayacı korur. Provider final evidence düzeltmesi unsupported durumlarını da kapsar: desteklenmeyen süreye rağmen üretilen “30dakika kaldı” gibi cevap bir kez düzeltilir, araç otomatik tekrarlanmaz. İşlem/ayar değişikliğini uygulamak için mevcut açık onay kartları aynen korunur; sorgu yeni bir değişiklik yetkisi değildir.

## Dosyalar ve sınırlar
Yeni saf helper'lar `assistant-library-query`, `assistant-playback-math`, `assistant-action-options`; registry/provider/main ve renderer dispatch/index yükleme sırası bağlandı. Dört yeni Node test dosyası, provider regresyonu ve ayrı Windows smoke eklendi. Yeni bağımlılık, depolama şeması, kalıcı ayar, credential değişikliği, CSS veya görsel yeniden tasarım yok. Mevcut grafik/amber üst medya menüsü korunur. Tanı gerekçeleri typed araç verisidir; kullanıcı cevabının EN/TR dili mevcut locale sözleşmesiyle sağlanır.

## Doğrulama
Son birleşik7test dosyası: **53PASS /0FAIL** (yaklaşık0.68sn).
`node --test --test-isolation=none tests/assistant-library-query.test.js tests/assistant-playback-math.test.js tests/assistant-action-options.test.js tests/assistant-command-power.test.js tests/assistant-capabilities.test.js tests/assistant-app-actions.test.js tests/assistant-provider.test.js`
14JS dosyasında node --check ve git diff --check geçti.

6entegrasyon testi gerçek main kayıtlarını, controlled JSON provider döngüsünü, gerçek UMD registry ve renderer action modüllerini VM'de çalıştırır: nested AND, snapshot sayfalama, gerçek total/unknown, read-only hesap, unsupported reason/failed ledger, kaynak değişimi ve yabancı sender reddi. VM gerçek tarayıcı değildir.

`tests/electron-assistant-command-power.smoke.js` ayrı sentetik profil ve ağ kapalı gerçek Windows Electron'da mevcut uygulamayı başlattı; yeni helper'ların yüklenmesi, gerçek katalog IPC'si, exactID'ler ve iki sayfanın aynı revision/toplamı geçti (exit0). Kanıt: tmp/visual-identity/assistant-command-power.log; kişisel profil kullanılmadı. Oynatma matematiği gerçek renderer modülleriyle kontrollü ölçümler üzerinden sınandı; canlı YouTube/DRM/GPU/gerçek medya davranışının tamamı doğrulandı denmez.

Canlı DeepSeek, ücretli API, gerçek site, kişisel hesap, start.bat/GPU modeli, tam npm test ve Actions çalıştırılmadı. Bu read araç paketi yeni UI layout getirmediği için dar ekran estetik doğrulaması yapılmadı. Mevcut kişisel OFFLINE-MANIFEST/.codex ve ana kopyadaki korunmuş dosyalara dokunulmadı. Normal PR/merge/ff-only teslimi [skip ci]; uzun CI beklenmez.
