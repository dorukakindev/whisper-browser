# Rapor746 — Altyazı indirmede kesin dosya sahipliği

## Doğrulanan kök nedenler
`backend/media.py fetch_subs` işlem sonucundaki dosya yerine girdi klasöründeki videoID/dil adına uyan en yeniSRT'yi seçiyordu. İstenen altyazı bu çağrıda bulunmasa, videoID eksik olsa veya dönüşüm tamamlanmasa bile eskiSRT başarı olabiliyordu. İkinci kök: manuel ve otomatik aynı video/dil aynı dosya adını paylaşıyordu; yt-dlp mevcut dosyayı atlayınca iki tür karışabiliyordu. Bu iki kök sekiz ayrı bug diye sayılmaz.

## Düzeltme ve dosyalar
- `backend/media.py`: son postprocessor `requested_subtitles[lang].filepath` ve `ext=srt` sonucunu kullanır; video kimliği ve gerçek, dolu, çıktı kökü içindeSRT aranır. Eksik dil/id, sıfırboyut, VTTolarakkalan veya dışarıdaki dosya reddedilir. Bölgeseldil/başkaenSRT sessiz seçilmez. Aynı dosya yeniden istenebilir, mtime/yenioluşma şartı yok.
- İndirme çıktısı artık seçili girdi kökü içinde `youtube-captions/manual/` ve `youtube-captions/automatic/` ayrılır. EskiSRT'ler taşınmaz/silinmez; eski doğrudan yol kayıtları korunur. İlk yeniden indirme yeni altklasörü oluşturur. Yeni JSONşema/IPC/ayar/bağımlılık yok.
- `tests/test_media_caption_artifact.py`: eskiSRT/eksikID/en-yerine-enUS/sıfır/unconverted/dışkök/ennewerfile/modayrımı/tekrar; gerçek kurulu yt-dlp postprocessor+FFmpeg ve Türkçe dosya yolu dönüşümü. FFmpeg/yt-dlp yoksa yalnız bu opsiyonel entegrasyon açıkSKIP, diğer kontroller çalışır. BuWindowskoşuda8PASS/0SKIP.

## Önce/sonra ve gerçek ağ
[Parent regresyonu](evidence746/parent-regression.txt):ilk6testte6assertionFAIL, tekraraynıdosyaPASS; bütün kritik yanlışbaşarılar repro. Sonkod8PASS, Pythoncompile/diffPASS. Mevcut assistant-caption-actions10PASS; eski testler yeni keşif sayılmaz.

Kişisel hesap/çerez/APIanahtarı olmadan mevcut opt-in testvideosu `jNQXAC9IVRw` ile yalnız altyazı istendi, video/ses indirilmedi.45snwatchdog kullanıldı, timeouttetiklenmedi.
- [Manuel ilk](evidence746/manual-first.json): gerçekYouTube,exit0,1.875sn,416byteSRT,gerçeksonuçyoluyoutube-captions/manual altında.
- [Manuel tekrar](evidence746/manual-repeat.json): exit0,1.969sn,416byte,aynıyol;SHA256kanıtta. İlkkoşudabirebirhashalınmadığı için ikiçağrıhashaynıiddiasıyok.
- [Otomatik deneme](evidence746/automatic-attempt.json):exit1,2.125sn,subsbaşarısıyok. Mevcutmanuelinbaşarıolarakdönmemesi gözlendi. Kullanıcı mesajı genel; asıl gerçek ağ başarısızlık nedeni bu kayıtta ayrıştırılmadı, 'otomatikaltyazıyokkesin' denmez. Kontrollüeksikcaptiontestiise kesin eski dosyaya düşmeme kanıtıdır.

## Kaynak, Windows ve sınırlar
[yt-dlp resmi FFmpeg postprocessor kaynağı](https://github.com/yt-dlp/yt-dlp/blob/master/yt_dlp/postprocessor/ffmpeg.py) ve yereldekurulu run() incelendi: requested_subtitles dönüşümsonrasıyol/extgünceller. Dışkod kopyalanmadı/yeni bağımlılık eklenmedi; mevcut yt-dlp API'si kullanıldı, gerçek dönüşüm çalıştırıldı. KaynakREADMEiddiası yerine çalışan kod ve işlem sonucu esasalındı.

UIdeğişmedi,görseltestyok; main/preload/renderer/kişiselayarlar/start.batdeğişmedi. Gerçek çeviri/dublaj,GPU,insandinleme,oturumgerektirensiteler,tümextractorler,timeout/ipalin gerçekten tetiklenmesi bu pakette yok. Önceki yorumda hedeflenen zaman aşımı/iptal kapsamı hâlâ açık, bu düzeltme onları tamamladı iddiası değildir. Genelhatailetisinin ayrıntısı açıkUXsınırı. UzunCI/tampaketbeklenmedi.90hedefdevam,müzikyok.
