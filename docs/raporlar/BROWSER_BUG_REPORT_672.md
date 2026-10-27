# Rapor 672 — Seçili müzik önizlemeleri ve bağlı analiz çalışma alanı

Başlangıç `afd44a319ccc71395c436a149067b605257ab5d4`; ürün bitiş `7437e7d025cbf38917a0421be83e238f3e61fd33`. Dal `codex/music-workspace672`. R671 devamıdır; önceki kaynak hazırlama/CLAP motoru korunur.

## Uygulananlar ve doğrulanan hata

- İnternet sonuçlarında karşılaştırılacak en fazla sekiz kayıt açıkça seçilir. İlk sekizi seç, seçimi temizle ve seçili sayısı vardır. Asistan da aynı güncel kimliklerle seçim yapabilir; rastgele URL kabul edilmez. Karşılaştırma artık körlemesine ilk sekizi almaz.
- Sonucu referans yapınca katalog ve seçim korunur, eski referansa ait puanlar/süreler temizlenir. Böylece seç–analiz et–karşılaştır akışı tekrar arama gerektirmez.
- Referans seçicisi yerel müzik, incelenmiş Spotify listeleri ve kaydedilmiş Deezer keşiflerini birlikte arar. Alt müzik oynatıcısına Çalan parçayı analiz et eklendi.
- Aynı çevrimiçi kimlik panel açıkken tekrar seçildiğinde hazırlanmış WAV yeniden kullanılır. Kapanışta önbellek boşaltılır, geçici dosyalar silinir. Sekiz benzersiz kaynak sınırı devam eder.
- **Kesin hata:** Kayıtlı keşif listesi 500 kayıt döndürebiliyordu, fakat known-ID haritası 200 ile sınırlıydı. Liste yüklenirken ilk 300 kimlik eleniyor, ekranda görünmesine rağmen kaynak seçimi reddedilebiliyordu. Sınır 1000'e çıkarıldı; 500 kayıt içinden ilk ve son kimliğin kullanılabildiği ve uydurulmuş kimliğin reddedildiği davranış testi var. Harita hâlâ sınırlıdır.
- Kartlarda kapak–başlık–sanatçı–kanıt–puan hiyerarşisi; ayrı ve saran işlem sırası; dar ekranda erişilebilir seçim ve düğmeler; klavye odakları, canlı durum, sabit görsel boyutları. Mevcut grafit/amber tema kullanılır. Görsel sonuçlar aşağıdaki gerçek Windows çekimleridir.

## Kaynak incelemesi

[Luna Player Music.tsx](https://github.com/Nothingman333/Luna-Player/blob/859b0925ad51d878293377353476e7957eb8bc91/app/src/Music.tsx) ve aynı revizyonun App.css dosyası yerel Git checkout üzerinden incelendi; origin/main fetch kimliği `859b0925ad51d878293377353476e7957eb8bc91`. Bu, doğrulanan main kaynağıdır; en yeni beta çalıştırıldı iddiası değildir. Luna GPL-3.0 kaynak kodu kopyalanmadı; satır hiyerarşisi ve bağlı oynatıcı yaklaşımı mevcut MIT kodumuzda bağımsız uygulandı. [Web Interface Guidelines](https://github.com/vercel-labs/web-interface-guidelines/blob/main/command.md) odak, boyutlandırma ve dar ekran kontrolü için kullanıldı. Yeni bağımlılık yok.

## Kanıtlar ve sınırlar

`node --test --test-isolation=none tests/music-workspace672.test.js tests/music-remote671.test.js tests/music-analysis.test.js tests/music-online.test.js tests/assistant-music.test.js`: **13 PASS**. Sekiz değişen JS/test girişinde syntax ve `git diff --check` PASS.

`D:\Whisper Local\node_modules\electron\dist\electron.exe tests/electron-music672.smoke.js`: ayrı geçici profille gerçek Windows/Electron. Son koşum `1793141174719`: Spotify/incelenmiş YouTube ilk90sn DSP; oynatıcıdan analiz; canlı Deezer 29,989sn önizleme DSP; gerçek CLAP etiketleri; seçili yalnız iki önizlemenin CLAP karşılaştırması; referans değişiminde katalog korunması; kaydedilmiş keşif seçicisi; dar ekran taşma ve fiziksel WAV temizliği **PASS**. Otomatik sonuç [result.json](MUSIC_WORKSPACE_2026-10-28/result.json).

İlk672 koşumunda test, ana süreç işi bitince renderer'ın sonraki durum yenilemesini beklemeden hâlâ kapalı seçim düğmesine bastı ve timeout oldu. Test, UI düğmesinin gerçekten etkinleşmesini bekleyecek şekilde düzeltildi; ürün hatası olarak sayılmadı, süre/eşik gevşetilmedi. İlk çağrıda checkout altında Electron ikilisi bulunamadı; mevcut ana kurulum ikilisi kullanıldı. Son koşum ve ek kontrollerin tümü geçti.

[Windows geniş görünüm](MUSIC_WORKSPACE_2026-10-28/internet-wide.png) · [dar görünüm](MUSIC_WORKSPACE_2026-10-28/internet-narrow.png) · [kaynak seçicisi](MUSIC_WORKSPACE_2026-10-28/source-picker.png). Test profili, kullanıcı verisi ve ses dosyaları commit edilmez.

Tam npm paketi/uzun CI, temiz install.bat/start.bat başlangıcı, GPU/DRM, özel Spotify hesap yetkilendirmesi, insan kulağıyla tercih ve canlı LLM araç seçimi bu turda doğrulanmadı. Native test GPU kapalı özel Electron girişidir; kişisel uygulama kapatılmadı. Mevcut 11 before-quit listener uyarısı önceki native koşumda görüldü; bastırılmadı ve bu paket onu çözdü iddiası taşımaz. CLAP puanları tercih olasılığı değildir; internet metadatası tek başına ses benzerliği değildir. Spotify kaynakları incelenmiş YouTube sürümünün ilk en fazla90sn'si, Deezer kaynakları yaklaşık30snönizlemedir; tam eser analizi iddia edilmez. Yeni IPC kanalı, kalıcı şema veya paket kurulumu yok.
