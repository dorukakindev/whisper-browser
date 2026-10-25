# BROWSER_BUG_REPORT_550 — Gece ilk teslimi: tema, dil ve güvenlik sözleşmeleri

Tarih: 2026-10-25 05:24 Europe/Istanbul. Repo: https://github.com/dorukakindev/whisper-browser. Dal: `codex/book-reliability549`, PR487. Başlangıç `ed032dcb397ac445872acbed8f717716628620e4`; bitiş ürün/test kodu **`2c217ab974797f609132aeebe653d75f7d9eb54e`**. Ana kopya/master değiştirilmedi. Bu rapor 50 yeni bug iddiası değildir; gece havuzunun ilk doğrulama/düzeltme paketidir.

## Doğrulanan durum ve değişiklikler

1. **Dil sözlüğü regresyonu:** Okuma ve Orijinal metin yinelenmişti; anahtar tekilliği bozuluyordu. PDF okuma araçları, önceki/sonraki sayfa, sayfa seslendirmesi ve sayfa bağlamı değişim hata mesajlarının EN karşılıkları eksikti. Tekil kanonik kayıtlar korundu; yeni metinler eklendi. TMDB ayarları kaynak dilde tutarlı yapıldı. Yeni OSD eski, zaten çevrilen ifadeyle birleştirildi. Kullanıcı metinleri çeviriye sokulmadı.
2. **Tema borcu:** Amber/indigo sabit durum/fokus renkleri, seçili açık temanın vurgu rengine uymuyordu. Bileşen renkleri mevcut accent/success tokenları ve color-mix ile bağlandı. Sabit literal toplamı **460 → 424**, izin sınırı **430 → 424**. Eşik yükseltilmedi. PDF/kitap koyu ve açık gerçek Windows görüntüleri incelendi; bütün uygulama için ölçülmüş kontrast başarısı iddia edilmez.
3. **Asistan aboneliği yaşam döngüsü:** Snapshot subscribe metodu dinleyiciyi kaldırma yolu döndürmüyordu. Artık bağımsız, tekrar çağrılabilir unsubscribe döndürür; geçersiz callback erken reddedilir. Electron event nesnesi renderer'a aktarılmaz. Asistan IPC kayıtlarına owner/mainFrame denetimi yapan ek sarmalayıcılar eklendi; mevcut iç denetimler de korunur. Yabancı sender/subframe reddi ve kapanışta listener kaldırma sınandı.
4. **Erişilebilirlik sözleşmesi:** TMDB ayar havuzu landmark dışında kalmıştı; adlandırılmış region sağlandı. Gerçek arayüzde hidden sınıfıyla gizlenir; CSS yüklemeyen axe statik taramasında da sıfır region borcu korunur. Bu durum gerçek görünür ayarların her zaman erişilemez olduğu iddiası değildir.
5. **DOM izin envanteri:** Yeni kod satırları yüzünden 19 incelenmiş ifade eski satır adreslerine bağlı kalmıştı. İncelenen sinklerin literal SVG/enum, sayısal değer veya kaçışlı markup üretimi korundu. İzin kimliği dosya + tam RHS SHA-256 + tam ifade oldu; sadece CRLF/LF normalize edilir. RHS değişimi, silinme veya aynı sinkin çoğalması inceleme gerektirir. Satır kayması, kaçışsız yeni değer ve değiştirilmiş sink negatif kontrolleri eklendi. Bu statik test tam veri akışı/XSS kanıtı değildir.
6. **IPC tarayıcı doğruluğu:** Tek tırnakla sınırlı regex, çift tırnaklı media-workflows handlerını kaçırıyordu; named callbackin denetim gövdesini de görmüyordu. Her iki alıntı biçimi ve callback tanımı okunuyor. Owner yardımcılarının açık sender+mainFrame eşitlikleri aranır; bilinmeyen handlerı otomatik kabul eden genel istisna yok.
7. **Protokol envanteri:** CSP ve privileged-scheme testleri zaten mevcut `whisper-media` protokolünü tanımıyordu. Ürün CSP/privileges genişletilmedi; test mevcut üç iç şemaya sabitlendi. Torrent akışı rastgele capability tokenı ve `/video` rotası kullanır. Sahte token/yanlış rota/keyfi dosya parametresi/HEAD/POST, motor kurmadan ve ağ isteği olmadan reddedildi; ayrı yerel medya grant testi de geçti. Aktif geçerli torrent/GPU oynatımı bu testin kapsamı değildir.
8. **Yanlış kapsam açığı:** coverage-map, Python testlerini yalnız backend altında arıyordu; `tests/test_assistant_stream.py` içindeki mevcut iptal/transport testlerini saymıyordu. Tests altındaki Pythonlar taramaya alındı ve bu dosyanın direct kapsamı regresyonla kilitlendi. Kapsam metriği gerçek kalite kanıtı yerine kullanılmaz.
9. **Fixture/arayüz sözleşmesi borcu:** GPU boşaltma için yeni releaseIdle bağımlılığı ve dublaj oynatma snapshotına ait window/watchItemByKey bağımlılıkları eski VM fixturelarında eksikti. Bunlar modele erişmeyen açık stublarla tamamlandı; eski yetki/yarış/senkron iddiaları korunarak yeniden koşuldu. Native oynatıcı seçimi iptali, yabancı istek, bayat oturum komutu ve stop için doğrudan modül testi eklendi. Gerçek mpv embed/hardware doğrulaması değildir.
10. **Diğer statik sözleşmeler:** PDF voice girişleri yeni kitapta sıfırlanan geçici kontroller olarak sınıflandı. Locale script sırası gerçek AssistantSourceContext dosyasını içeriyor. Windows voice subprocess PATH testinde mevcut doğrulanmış araç dizinlerinin kullanıcı PATH önüne eklenmesi sınandı; kullanıcı PATH son ekinin korunması zorunlu. Renderer'daki `global` adlı yerel değişken daha açık `selectionContext` oldu; bu Node global kullanım hatası değildi.

## Tam koşumun sınıflandırması

Önceki arka plan `tmp/full549.log` tamamlandı: **21 test dosyası başarısız**. Sonuç sonradan görülmüştür; önceki teslimin finali bu sonucu başarılı diye sunmamıştı. Bu turda aynı 20 dosyalık kırmızı küme ve ilişkili sınır testleri hedefli tekrarlandı ve geçti:

- Gerçek ürün/arayüz sözleşmesi: accessibility, browser-report117-regressions, i18n-coverage, ui-locale-dedupe/dynamic/userdata/ui-locale, css-hardcoded-colors.
- Test tarayıcı/izin kimliği borcu: coverage-map, csp-policy, deep-link-surface, dom-innerhtml-ratchet, ipc-parity, renderer-realm-faithfulness, settings-ui-persist-roundtrip, report477-regressions.
- Eski VM fixtureları: adversarial-ipc, audit-tur4, local-sync-profiles, subtitle-output-contract.
- **Açık kalan:** ci-determinism-ratchet, fixed-sleep sayısı 26 > 21. Eşik gevşetilmedi, test kapatılmadı. Uyku sayısı tek başına ürün interval/bellek sızıntısı değildir; koşul/event tabanlı bekleme için ayrıca incelenecek.

Yerel sağlayıcı E2E eski tam logda 46 kontrol PASS; takılma yeniden üretilmedi. Ona yönelik varsayımsal süreç temizleme kodu eklenmedi. Uzak GitHub CI bu tur beklenmedi; sonucuna dair yeşil iddiası yok.

## Dosya amaçları

- `src/assistant-overlay-preload.js`: kaldırılabilir snapshot aboneliği ve callback kontrolü.
- `src/assistant-overlay.js`: IPC kayıt yerinde owner/mainFrame ek denetimleri ve aynı callbackle cleanup.
- `src/renderer/global-assistant.js`: yerel bağlam değişkenini açık adlandırma.
- `src/renderer/index.html`: TMDB dil etiketleri ve adlandırılmış ayar regionı.
- `src/renderer/renderer.js`: var olan çevrilen OSD ifadesinin kullanımı.
- `src/renderer/styles.css`: tema tokenına bağlı vurgu, başarı ve fokus yüzeyleri.
- `src/renderer/ui-locale.js`: tekil sözlük, PDF/bağlam/TMDB EN/TR kayıtları.
- `tools/coverage-map.js`, `tests/coverage-map.test.js`: tests dizinindeki Pythonların gerçek import kapsamı.
- `tests/assistant-native-boundaries.test.js`: preload ve native player doğrudan sınır testleri.
- `tests/media-hub.test.js`: protokol/token/yol/metot negatifleri.
- `tests/csp-policy.test.js`, `tests/deep-link-surface.test.js`: mevcut iç protokol sözleşmesi.
- `tests/dom-innerhtml-ratchet.test.js`: RHS parmak izi, tekillik ve negatif mutation denetimleri.
- `tests/ipc-parity.test.js`: alıntı/callback tarayıcısı ve sahiplik tanımı.
- `tests/adversarial-ipc.test.js`, `tests/audit-tur4.test.js`: güncel GPU/asistan VM bağımlılıkları.
- `tests/local-sync-profiles.test.js`, `tests/subtitle-output-contract.test.js`: dublaj snapshot VM bağımlılıkları.
- `tests/report477-regressions.test.js`: Windows araç PATH öneki ve kullanıcı son eki.
- `tests/settings-ui-persist-roundtrip.test.js`: sayfa seslendirme geçici girişleri.
- `tests/ui-locale.test.js`: gerçek script sırası; ISO kodları/glifler ve kendi locale sahibindeki medya kabuğu etiketleri.
- `tests/fixtures/css-hardcoded-color-baseline.txt`: aşağı çekilmiş 424 sınırı.

## Doğrulama ve sınırlar

- 25 dosyalık hedefli Node koşusu `tmp/final550.log`: runner **50 PASS / 0 FAIL**; özel test scriptleri kendi alt kontrollerini de geçti. Komut dosya listesi git diffte/test logda; sayı 50 yeni bug veya 50 yeni test dosyası değildir.
- `D:/Whisper Local/backend/venv/Scripts/python.exe tests/test_assistant_stream.py`: **8 PASS**, kontrollü SSE UTF-8, iptal sonrası partial korunması ve transport kapanışı dahil. Harici ücretli sağlayıcı yok.
- Native Windows Electron book reliability smoke: **exit0**, `.uiprev/book-reliability549-1792894921016`; Review/M4B/PDF ve açık-koyu ekranlar. `reader-tr-dark.png` ve `resources-en-light.png` görsel olarak incelendi. Ses sine-wave fixture; gerçek model kalite kanıtı değil.
- Native trusted bridge smoke: **exit0**, `tmp/bridge550.log`; gerçek medya/shadow/iframe ve isolated world akışı.
- Değişen JSlerde `node --check`, yeni test syntax ve `git diff --check` geçti.
- Tam paket yeniden koşulmadı; bilinen tek kalan sınıf fixed-sleep ratchetidir. Yeni uzak CI sonucu beklenmedi. Yeni GPU/CUDA üretimi, canlı YouTube/Letterboxd/DRM, gerçek mpv/torrent ve kişisel `start.bat` profili denenmedi.
- Yeni bağımlılık/model/kurulum/şema yok. Windows dosya/diyalog testleri sentetik geçici klasörlerde; kullanıcı kitap/ref/ayarlarına erişilmedi.
- Otomatik onay denetimi, ek IPC wrapperlarını kaldırma denemesini riskli buldu; adım uygulanmadı, ek sahiplik katmanı korundu. Bloke kalan ürün işi yok.

Sonraki gece işi: N10 koşul tabanlı test beklemeleri; N11–N15 M4B önizleme/alan/ilerleme/gerçek iptal; ardından yedek ve okuyucu akışları. Liste tamamlama sayısı yerine kanıtla güncellenir; master'a otomatik merge yok.
