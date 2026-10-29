# Rapor740 — Referans yenilemesinde gerçek kullanılabilirlik

## Doğrulanan hata
Metin stüdyosunda yerelden seçilmiş referanslar yenilemede yeniden kontrol edilmiyordu. Kopyalanmış sentetik WAV silindi, Sesleri yenile tıklandı: Seslendir açık kaldı. [Parent exit1 kanıtı](evidence740/before.txt). Ortak listeden kaybolan referans ise listeden çıkarılıyor ama önceki audio kaynağı temizlenmiyordu. Backend üretimde geçersiz WAV'ı zaten reddeder; hatanın kapsamı sahte hazır UI ve eski önizlemedir, geçersiz WAV ile başarılı model üretimi değildir.

## Kod
- `src/text-voice-studio.js`: mevcut dub:textVoice kanalı içinde reference-status salt-okuma eylemi. Yalnız bu renderer'a daha önce verilen local kimlik veya ortak referans kimliği çözümlenir; renderer ham dosya yolu belirleyemez. Mevcut validVoiceOutput geçerlilik kontrolü, geçerliyse mevcut medya yetkilendirmesi kullanılır. Bozuk/kayıp yerel dosya ready=false ve boş URL döner; sahte kimlik reddedilir.
- `src/renderer/text-voice-studio.js`: yenilemede ortak liste ve seçili yerel referans kontrolü birlikte alınır; istek sırası ile yalnız güncel yanıt uygulanır. Kontrol sürerken üretim kilitlidir; aktif üretimde yenileme uygulanmaz. Geçersiz seçimin adı ve kimliği Kullanılamıyor ekiyle korunur, başka sese otomatik geçilmez. Üretim/örnek/kaydet/varsayılan eylemleri kapatılır. Audio pause→src temizleme→load ile boşaltılır. Dosya geri gelip yenilenince aynı kimlik ve döküm taslağıyla geri döner. Normal geçerli yenilemede aynı audio URL'si gereksiz yüklenmez. Kullanıcı adı taslağı ve metni yeniden yazılmaz.
- `tests/text-voice-studio.test.js`: yerel geçerli/bozuk/kayıp/geri getirilmiş WAV ve sahte/boş kimlik.
- `tests/electron-text-voice.smoke.js --reference-refresh`: gerçek Windows ana/preload/renderer ve sentetik dosyalarla yerel ve ortak kaldır/geri getir, eski preview temizliği, varsayılan dahil eylem kilitleri, tam kimlik/döküm/metin korunumu, EN/TR eksik etiketi ve dar açık görünüm. Geciktirilmiş iki liste yanıtı ters sırada teslim edilerek eski boş listenin yeni doğrulamayı bozamaması da kontrol edilir. --event-ownership ile önceki iş-sahipliği/hata deneyimi regresyonu birlikte çalıştı; tekrar yeni bulgu sayılmadı.

## Doğrulama
- Önce parent native exit1 → final native exit0. Bu tur model/GPU/API üretimi yok; referans gerçek sentetik WAV decoder/girdi doğrulamasıdır. [Ölçümler](evidence740/acceptance.json).
- [EN koyu eksik referans](evidence740/studio-reference-unavailable-en.png) ve [TR açık480CSSpx/%125](evidence740/studio-reference-unavailable-tr-narrow.png) gerçekten açılarak incelendi. Yatay taşma yok; eksiklik açıklaması görünür, diğer dosyaya sessiz geçiş yok. Mevcut grafit/amber/açık tema ve44px eylem düzeni korundu; yeni tasarım sistemi eklenmedi.
- `node --test --test-isolation=none tests/text-voice-studio.test.js tests/preload-sandbox.test.js`:3PASS/0skip. Değişen JS syntax ve git diff kontrolü PASS.

## Kaynak ve sınırlar
Mevcut ortak referans deposu ve validVoiceOutput kullanıldı. [MDN HTMLMediaElement.load](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/load) src kaldırıldıktan sonra eski medya durumunu sıfırlama davranışı için incelendi. Üçüncü taraf kod/yeni bağımlılık alınmadı; yeni IPC kanalı/kalıcı şema yok, mevcut kanalda bir salt-okuma eylemi var.

Bu bir dosya izleyicisi değildir: yeniden kontrol Sesleri yenile veya ekranı tekrar açma sırasında yapılır. Geçerli bir WAV'ın içeriği aynı yolda başka geçerli WAV ile değiştirilirse ses kimliğinin kriptografik kontrolü bu pakette yok; hatalı döküm/insan ses kalitesi de ölçülmedi. Erişilebilirlikte fiziksel ekran okuyucu/dosya seçici, GPU/TTS, canlı API, tüm OS/DPI ve start.bat etkileşimli kabulü yapılmadı. Tam npm/CI beklenmedi; CI açık. Mevcut11listener uyarısı ve kontrollü kapalı ağ filtresi uyarısı sürer. Kişisel dosyalar/profil/pano kullanılmadı. P031/P035/P037/P092/P097 kısmi ilerleme;90hedef devam, müzik kapsam dışı.
