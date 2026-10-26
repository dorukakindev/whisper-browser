# Rapor 617 — İki Claude asistan araştırma paketinin değerlendirilmesi

Repo https://github.com/dorukakindev/whisper-browser. Dal `codex/assistant-review617`.
Başlangıç HEAD `b7f9dc29089f2c121c2a578f8169117694055cdc`. Başlangıç/bitiş ürün commit'i aynı: `fa2797cf8e59c5dfacd24b76a048f2c34c36b3f5`.

## Hüküm

`files (1).zip` önceki `files.zip` tesliminin genişletilmiş sürümü; ikisini ayrı uygulama paketi saymamak gerekir. **Araştırma ve tasarım olarak faydalı, doğrudan uygulanacak kesin şartname olarak henüz koşulsuz kabul edilmez.** Ürün patch'i yok; bu tur da ürün değişmedi. İlk paketin mimari, bulgu, capability ve repo karşılaştırması ikinci pakette aynı. İkinciye Sider hedefi ve görev/kabul ekleri gelmiş.

## Yapı ve bütünlük

Dış arşivler 133.472 ve 145.365 bayt; ikisinde de iç `ASSISTANT-RESEARCH-DELIVERY.zip` var. İç üyeler güvenli göreve özel tmp dizinine çıkarıldı; absolute/üst dizin yolu ve beklenmeyen büyük üye reddi uygulandı, ek shell komutları otomatik çalıştırılmadı.

İkinci pakette: **54 yetenek ailesi,121 kabul senaryosu,27 karşılaştırma satırı,20 bulgu kaydı**. CSV dosyaları ayrışıyor, taşmış sütun yok; FINDINGS JSON geçerli. 20 kayıt20bug değildir: mevcut yetenek, öneri, çürütülmüş iddia ve ortam sınırı kayıtları da var. README hâlâ103 senaryo diyor; görev listesi T00–T34'e genişlemiş olsa da bazı özetler T00–T22'de kalmış. Kaynak eskiZIP96b204f1yerine GitHubdd91cb3 ürününe dayandırılmış; bizim616snapshot'ımız da dd91cb3'tür. Paketteki eskiZIP eleştirisi616paketinin eski olduğunu kanıtlamaz.

## Bağımsız doğrulamalar

| Konu | Karar | Kanıt ve sınır |
|---|---|---|
| F01: araçların altyazı havuzuna bağlı olması | Koddan doğrulandı | `backend/assistant_stream.py` use_tools=bool(pool and enabled); uygulama genelinde eylem aracı değildir |
| F04: tekrar gelen function.name | **Sentetik probe ile tekrarlandı** | Gerçek ürün `stream_answer` çağrıldı. Normal parçalı akış search_subtitles; tam adı tekrarlayan akış search_subtitlessearch_subtitles ve Unknown tool. Canlı sağlayıcı sıklığı bilinmiyor; standart parçalı adı da desteklemek gerekir, kör atama/ekleme çözümü seçilmez |
| F05: extra_content kaybı | **Alan kaybı sentetik probe ile tekrarlandı** | Sonraki istekte tool_call yalnız function/id/type anahtarları; Gemini benzeri fixture imzası taşınmadı. Bu tur gerçekGemini/DeepSeek400hatası üretilmedi; reasoning_content yolu bağımsız yeniden koşulmadı |
| F08: sohbet global iş kilidi | Koddan doğrulandı | aiChatSend state.running/queueRunning kontrol ediyor; state.running=true, state.aiJob=true, player.job kind chat; startTranscribeSafe kullanıyor. Mevcut sınırlama gerçek; Node'a taşımanın tek başına kilidi çözdüğü iddiası doğru değil |
| F11: lisans regex riski | Mevcut kod koşullu riski destekliyor | Betiğin tamamı okundu: izin listesindeki regex final failures filtresinde doğrudan kullanılıyor, SPDX OR normalizasyonu yok. AI SDK henüz üründe kurulmadı; mevcut lisans testi başarısızmış gibi raporlanmaz |
| SDK sürümleri | Resmî registry metaverisi doğrulandı | İnceleme anında ai7.0.154 Apache-2.0 Node>=22; openai-compatible3.0.79 Apache-2.0 Node>=22; zod4.6.7 MIT; MCPserver2.4.0 Apache-2.0 Node>=20. Kurulum/APIparitesi/gerçeksağlayıcıbaşarısıkanıtıdeğil |

Yerel tekrar probe'unda yalnız kaynak import yolu Windows'a uyarlandı, davranış fixture'ı değiştirilmedi. İlk denemede Linux yolunu backslash ile değiştirmek Python string'inde kaçış sorununa neden oldu; forward-slash yolu düzeltilince probe başarıyla çalıştı. Ürün veya test kaynakları değiştirilmedi. Ham çıktı `D:/Whisper Local/tmp/assistant-review617/verified-probe.json`, Git dışında.

Web aracı npmURL'lerini açamadı; aynı birincil registry HTTPS metaverisi PowerShell Invoke-RestMethod ile okundu. Paket kurulmadı. Ücretli API/kişisel anahtar kullanılmadı.

## Araştırma derinliği

Kendi raporu dürüstçe söylüyor:20 repo klonlanmış; yalnız **birinde kaynak+test+çalıştırılan probe**, yaklaşık10'unda parça/grep ve diğerlerinde lisans/dosya adı/npm metaverisi. Bu, kullanıcının istediği bütün adaylarda çok derin kod araştırmasının tamamlandığı anlamına gelmez. Repo sayısı yerine seçilecek az sayıdaki adayın ilgili yürütücü, izin, iptal ve test gövdeleri incelenmelidir.

Eksik kabul edilen kendi-kod alanları önemli: processNextQueueItem gövdesi, transcribe:start tam handler'ı ve media-workflows action dispatch. 54 aile bütünA–ZUI/ayarlar envanterinin bitmiş olduğunu göstermez. Üçüncü taraf OpenAIuyumlu sağlayıcıların tools desteği, Windows Electron ESM/paketleme ve native overlay/CDP kabulü açık.

## Alınmasını önerdiğim çekirdek

1. CapabilityRegistry: şema+availability+mevcut servis bağlantısı tek kayıt; yardım/çip/araç listesi buradan türesin.
2. AppActions: mevcut hazırtrackçevirisi, yalnızWhisper veWhisper+çeviri yollarını ayrı tipli eylemler olarak sarmala; ikinci işlem hattı yazma.
3. ContextManifest/owner token: tab/navigation/media/range/thread kimlikleri, yürütmeden önce yeniden doğrulama.
4. Yapısal execution receipt: accepted/running/partial/completed ve hata/iptal ayrımı; model metni başarı sayılmaz.
5. Normal ayarlar için redakte şema, tipli patch, gerçek ayar doğrulama ve geri alma. Secret değer modelde yok; endpoint profil değişiminde anahtar taşınmaz.
6. Kaynak rozeti, zaman linki, bağlama uygun çip, mevcut sayfa/PDF seçimini sorma. Var olan overlay ve yan sekme tek durumdan beslensin.
7. Provider uyum spike'ı: SDK yalnız sentetik testlerden geçti diye kesin bağımlılık kararı verilmesin; mevcut sağlayıcı adaptörü ve lisans/paketleme ayrı doğrulansın.

## Şartnamede uygulanmadan önce düzeltilmesi gerekenler

- **Main süreç kararı:** renderer kilidi ile Python'un yerleşimi aynı problem değildir. Kilidi ayrıştırmak her mimaride gerekir. SDK facade iyi; main/utilityProcess seçimi gerçek Electron import/paketleme/iptal ve event-loop ölçümüyle yapılmalı. Küçük mevcut sağlayıcı hata düzeltmesi için bütün mimariyi taşımak zorunlu değil.
- **Renderer JobRegistry:** görünümün bütün işlerin tek sahibi olması renderer reload/crash sırasında yanlış durum üretebilir. Yetkili main servisinden job snapshot/olay replay ve renderer yeniden bağlanması sözleşmesi eklenmeli. Genel yeni kurtarma projesi değil, iş durumunun doğru sahibi belirlenmeli.
- **Argüman provenansı:** normalize alt-dizi eşleşmesi kullanıcı yetkisi kanıtı değildir. URL, dosya token'ı, araç kimliği ve planlanan eylem host tarafında gerçek kullanıcı isteği ve doğrulanmış app context ile eşlenmeli. “Kullanıcı metninde geçiyor” denilerek araç yürütülmemeli.
- **Onay matrisi fazla kaba:** tüm dosya yazmayı R3 saymak mevcut dublaj/çeviri işinin rutin çıktı yazmasıyla çelişir. İstenen üretimin yönetilen yeni çıktısı ile kullanıcı dosyasını ezme/silme ayrılmalı. Onaylı planın alt adımları her seferinde tekrar sorulmamalı.
- **İzin tablosunda çelişki:** R4 satırında endpoint/torrent/filepicker tamamen yok veya yalnıznavigate deniyor; alt tabloda providerpreset/model kartla değişebiliyor. Tek bir tutarlı politika ve test gerekir; secret okuma ile kayıtlı provider seçimi aynı değil.
- **Sider eki kapsam kaydırıyor:** varsayılan dock/yanpanelP0 olamaz; mevcut kullanıcı tercihi Luna tarzı yüzen balon ve açılır paneli korumak. Dock ancak isteğe bağlı. OCR düşük öncelik kullanıcı tercihidir. Çoklu model/derin araştırma/sesli giriş sonraki ekler; temel program kumandası ve YouTube üç yolu önce tamamlanır. Buradaki öncelik öneridir, onaylanmış ürün kapsamı değildir.
- **SDK'ya erken kesin bağımlılık:** lisans denetimini sadece yeşil yapmak için whitelist gevşetilmez; seçilen SPDX dalı ve paket özelindeki dayanak belgelenir. Bu paket AI SDK Windows/gerçek provider başarısı sağlamaz.

## Sonraki araştırma kabulü

Seçili3–5adayın gerçek kaynak/test gövdeleri; mevcutkuyruk/ASR/kitapdispatcher tamamı; action ailelerini gerçek UI+preload+handler zinciriyle kapsam tablosuna bağlama; tool seçimlerinin negatif/race/belirsizkomut örnekleri; providerSDK spike ve paketleme. Araştırma tamamlandı denirken engelli/kısmi maddeler gizlenmemeli.

Bu tur ürün düzeltmesi veya yeni özellik uygulanmadı; kullanıcının son mesajı ek paket teslimidir. Tamtest/Electron/GPU/gerçeksağlayıcı tekrarlanmadı. Sadece belge/ZIP inceleme, gerçek kaynak okuma ve bir bağımsız sentetik probe yapıldı. Hedef iki arşivi değerlendirip alınacakları ve sakıncalı kararları ayırmaktı. OrijinalZIP'ler korunur, ham kullanıcı ekleri Git'e kopyalanmaz.
