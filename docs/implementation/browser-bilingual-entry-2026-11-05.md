# Tarayıcıda çift dilli çalışma

Güncel master8124d044 tabanında. Kullanıcı YouTube ve web videolarında Trancy benzeri doğrudan çift dilli çalışma istiyor. Mevcut BrowserPanel/cümle akışı/iki katmanlı altyazı ve kaynak zaman dönüşümleri korunur; yerel V3 sahnesini tarayıcıya taşımak ikinci/yanlış oynatma sahibi yaratacağından yapılmaz.

Kompozisyon: mevcut grafit/amber üst çubukta görünür Çift dilli çalış; sağdaki onaylı panelde kısa durum, altyazı seç/yükle-çevir/Whisper ve iki dil eylemleri; gerçek cümle akışı aşağıda. Dar görünüm mevcut scrim/overlay sahibini kullanır. Ana sayfanın Browser girişi üç nokta içinden görünür üst eyleme alınır. Font/renkler ortak token, yeni dependency yok.

Adımlar: giriş ve tab-bağlı görünüm -> gerçek mevcut yükle/çeviri/ASR eylemleri -> kısa kaynağın değişmesi/regresyon kontrolleri -> tek izole Windows görsel kontrol -> ayrı ürün/belge commit/PR/merge. Otomatik indirme/çeviri/ses yakalama yok. Her sitede altyazı/ASR desteği iddia edilmez. CUA/izin penceresi/CPU/matris yok.

Uygulandı: Browser üst eylemi görünür; çalışma seçimi sekmeye bağlıdır. Çalışmaya girmek işlem başlatmaz. Seçili web izi/iki hazır dil/Whisper/Canlı Whisper mevcut kontrol sahiplerine bağlanır. Eksik ikinci iz için ortak özel dil menüsü açılır; geciken seçim tab/media/generation/ilk iz değişince uygulanmaz. Tam V3 yerel sahnesi web’e taşınmaz; mevcut BrowserPanel ve gerçek web oynatıcısı kalır.

Kabul: browser-study.test.js ve player-workspace-runtime.test.js geçti, syntax/diff temiz, CSS410/419. İzole gerçek Electron ana süreç/preload/embedded browser üzerinden HTTP Range destekli yerel web sunucusu + gerçek MP4/WebVTT: iki dil özel menüden seçildi,2+2 cue yüklendi; cümle tıklaması2sn->12.01sn; aynı WebContents/tek video/URL korundu; geniş1440 ve dar940 görünümde taşma yok, dar panel434px. Dosya/izin diyaloğu0. Gerçek YouTube sağlayıcı indirmesi/ASR/çeviri/Canlı Whisper bu tur çalıştırılmadı; yalnız mevcut işlemlere giriş bağlandı. İlk izole test sunucusu Range desteği vermediği için seek başarısızdı; test sunucusu düzeltilince geçti, ürüne hayali seek düzeltmesi yapılmadı. Görseller/harness yalnız artifacts/.uiprev, commit dışında.
