# Rapor 513 — İsteğe bağlı kaynak anlatımı ve iki teknik raporun doğrulanması

2026-10-21. Başlangıç `3a8b3dd02fe9f1e44bd28f5ce412d8453850c1a5`; ürün commit'leri `1060f82fb03c7b25bb876d576c5663eeee34dcb6` ve `f2ab3701b0e0fe2eed3e0a207a4e3bf801cf1fb7`. Kullanıcı kaynak videonun anlatımını takip eden isteğe bağlı özellik istedi, ardından iki araştırma belgesi sağladı. Belgeler talimat olarak değil teknik iddia/öneri olarak incelendi.

## Uygulanan ilk sürüm

- **Videodaki anlatımı takip et · deneysel**, varsayılan kapalı. Açınca Hafif/Dengeli/Belirgin; başlangıç Dengeli. Manuel global ton otomatik modda devre dışı, değeri korunur. İş başında seçenek ve kaynak dondurulur, çalışırken kilitlenir.
- Cümle gruplarının özgün sesinde etkin enerji, perdenin göreli hareketi, durak yoğunluğu ve ötümlü çerçeve oranı hesaplanır. NumPy/FFmpeg mevcut bağımlılıklar; yeni model veya paket kurulmadı. Bu gerçek VAD/SER, duygu olasılığı, sözcük vurgusu veya konuşmacı ayırma değildir.
- 8 kHz mono analiz, grup başına en fazla 40 saniye; sessizlik, bozuk/kırpılmış ses, eksik veri, çok az ötümlü çerçeve ve neredeyse sabit saf tonda yönlendirme yok. En az üç geçerli grup gerekir. Sınırlar kalibre edilmiş doğruluk garantisi değil, koruyucu başlangıç eşikleridir. Müzik/örtüşen konuşma her zaman saptanamaz.
- Enerji video içindeki geçerli grupların medyanına göre yorumlanır; mutlak Hz hedef sese kopyalanmaz. Sahne boşluğu üzerinden yumuşatma yapılmaz. Etiketsiz konuşmacı değişimini tespit edemediği için çok konuşmacı analizi sınırlıdır.
- Kaynak özgün konuşmanın olduğu karışımdır; instrumental arka plan çıktısı analiz edilmez. Bu sürümde otomatik vokal ayırma, Silero VAD veya SER yok. Böyle özellikler varmış gibi sunulmaz.
- Kaynak sadece yetkili yerel medya veya tab/generation/video kimliği doğrulanmış YouTube. Aynı URL için tam ses indirme açılmaz; yt-dlp adres çözümü ve mevcut yerel relay ile yalnız plan aralıkları FFmpeg'e verilir. Ağ sunucusunun byte-range davranışı indirme miktarını etkileyebilir; sıfır ek trafik iddiası yok.
- Seçili zaman aralığı önce uygulanır. Temsilî önizleme için paketlenmiş yapay zamanlar değil `source_start/source_end` kullanılır. Sidecar birimleri açıkça milisaniye, kaynak/plan zaman alanları ayrı; SRT hash'i ve analiz edilen PCM/aralık hash'i bulunur. Kaynak kayması/dil uyumu bu hash'lerle otomatik doğrulanmış değildir.
- Çok dilli YouTube formatları saptanıp hangi track'in seçildiği kesin değilse analiz tahmin yürütmez. Görünür uyarı ve iş düzeyinde temel üretime dönüş vardır; **Analiz için yerel ses seç** ile tam istenen ses sağlanabilir. Bu kaynak klonlama referansından ayrıdır, yeni dosya yetkisi açılmaz. Yerel çok kanallı dosyada FFmpeg varsayılan ses akışı kullanılır; ayrı track eşleme sonraki iştir.
- Analiz CPU'da TTS GPU yüklenmeden önce çalışır. İlerleme, 90 sn FFmpeg çağrı sınırı, 30 dk worker sınırı ve mevcut süreç ağacı iptali bağlıdır. Durdurma başarısızsa yaşayan worker'ın sahipliği tutulur; sahte boşta durum üretilmez. İptal kısmi JSON'u temizler ve TTS başlamaz.
- Sabit enum profilinden izinli kısa VoxCPM2 stil yönergesi üretilir. Kullanıcının referans latentleri ses kimliği girdisi olarak kalır; kaynak ses referans/prompt yerine verilmez. SRT, editör ve ASR hedefi değişmez. Öfke/üzüntü/ironi etiketi, tam hız veya duygu eğrisi aktarımı yok.
- Otomatik analiz planı varsa bütün iş **reference-only**; belirsiz grupta yalnız ek yönerge kaldırılır. İş düzeyinde analiz başarısızsa mevcut Hi-Fi üretimine açık uyarıyla dönülür. Bunlar aynı koşullama değildir; UI belirsiz grupta “referans tonu aynen korunur” demiyor.
- Otomatik modda parça başına ses düzeyi eşitlemesi kapalı; clipping güvenliği/fade korunur. Son bütün-iş loudness işlemi ve video yavaşlatma ayrı kalır. Grup cache kimliği etkili stil + reference-only + dinamik son işlem içerir; belirsiz auto grup eski Hi-Fi cache'iyle karışmaz. Rapor/manifest, stil ve analiz sayıları tutar. Normal mod aynı cache/üretim yolunda kalır.

## Kullanıcı belgeleriyle karşılaştırma

`DUYGU_AKTARIMI_PR471_TEKNIK_RAPOR_2026-10-21.md` PR'nin `3a8b3dd0` kesitini, `VOXCPM2_ARASTIRMA_2026-10-21.md` ise eski `master:957bbfe9` kesitini inceliyor. Sonraki yerel commit'ler için doğrudan mevcut-hata kanıtı değiller.

Doğrulanıp bu tur ele alınanlar:

1. İlk otomatik uygulamada belirsiz grup Hi-Fi'ye geri dönebiliyordu; reference-only ile karışınca tutarsızlık riski gerçek. Tüm auto işinde tek koşullama + ayrı cache kimliği getirildi. İlk uygulama commit'i bu nedenle nihai davranış değildir.
2. `finish_audio()` parça kazancını ayrı ayarlıyordu; kaynak dinamikleri için risk gerçek. Sadece auto modda düzey eşitlemesi kaldırıldı; quiet/loud oran testi eklendi.
3. `bestaudio` çok dilli videoda istenmeyen sesi seçebilir. Açık track snapshot yokken çok dil koruması ve ayrı yerel analiz kaynağı eklendi. YouTube dil eşliği kusursuz çözüldü iddiası yok.
4. Zaman alanları, belirsizlik açıklaması ve modun ses cache'ine katılması önerileri uygulandı. Önizleme özgün zaman kontrolüyle doğrulandı.

İkinci rapordaki bağımsız grup cache'i, kararlı seed, bounded retry, Hi-Fi/stil ayrımı, Türkçe okuma katmanı ve ASR bütünlüğünün önemli kısmı güncel PR'da zaten var; yeniden yapılmış kazanım sayılmadı. Sıcak motor/GPU sahipliği, nano-vLLM sürüm yükseltmesi, ayrı SER, gerçek VAD/konuşmacı sınırları, manuel grup profili ve erken canlı önizleme bu tur yapılmadı. Dış motor/paketler değiştirilmedi.

## Kanıt

- Python: `tests/test_dub_prosody.py` 6, `tests/test_dub_generation_quality.py` 14, `tests/test_dub_finish.py` 6 geçti. Kaynak/hash/zaman bağı, sessizlik/gürültü/ton reddi, göreli enerji, gerçek önizleme zamanı, çok dilde ret, ASR hedefine etiket sızmaması, auto belirsiz grupta prompt değişmemesi ve dinamik oran korunması kapsanır.
- Node: dub-prosody, dub-service, dub-generator-ui ve ui-locale-dedupe geçti. Aralık/örnek argv, ilerleme, iptal/başarısızlık, TTS'ye geçmeme, JSON temizliği, varsayılan kapalı, UI kilidi, yerel analiz kaynağının referanstan ayrılığı kapsanır. Syntax/py_compile/diff geçti.
- Ayrı geçici headless Chrome profili: TR/EN × açık/koyu 1400 px, 0 kontrast hatası; güncel ekranlar incelendi. Gerçek Electron/start.bat/DRM doğrulaması değil.
- Gerçek yerel konuşmadan üç grup analizi + GPU sentezi: 15 adım/1 paralel, yükleme 10,656 sn, referans 2,047 sn, üretim+ASR 32,218 sn; dört deneme/bir tekrar, 3/3 grup hazır ve ASR benzerliği 1,0. Kırpma/hızlandırma 0. Bu ilk koşu dinamik son işlem onarımından önceydi.
- Nihai koşullama/son işlemle tek grup tekrar: yükleme 12,765 sn, referans 3,235 sn, üretim+ASR 18,625 sn; iki deneme/bir tekrar; hazır, ASR 1,0; kırpma/hızlandırma 0. Yeni cache kimliği nedeniyle önceki sesi kullanmadı.
- ASR sonucu yalnız metin bütünlüğüne kanıttır. Kaynakla öznel anlatım benzerliği, ses kimliği üstünlüğü ve kör A/B/C tercihi ölçülmedi. Gerçek YouTube ağı/hesap, tam video, çok dil seçimi ve start.bat çalıştırılmadı. Tam npm/CI sonucu beklenmedi; CI kapatılmadı. Ham ses/log/araştırma eki ve kullanıcı dosyaları Git'e alınmadı; ignored tmp kanıtları yerelde.

## Açık kabul deneyi

Rapordaki üç koşullu dinleme önerisi doğru: A mevcut Hi-Fi, B aynı referansla nötr reference-only, C otomatik yönergeli reference-only. Mod değişimiyle yönlendirme faydasını ayırır. Kullanıcıyla 30–60 saniyelik kör dinleme yapılmadan “daha doğal/duyguyu doğru aktarıyor” sonucu verilmeyecek. Şimdiki teslim açıkça **deneysel akustik anlatım takibi**; araştırma önerilerinin tamamı veya otomatik duygu sınıflandırma sistemi değil. Çeviri metnini duyguya göre yeniden yazmak ayrı kapsam, bu tur yapılmadı.

Birincil kaynaklar: [VoxCPM2 style control](https://voxcpm.readthedocs.io/en/latest/models/voxcpm2.html#style-control), [kullanım/koşullama rehberi](https://voxcpm.readthedocs.io/en/latest/usage_guide.html), [openSMILE pitch direction girdileri](https://audeering.github.io/opensmile/_components/cPitchDirection.html). Kaynaklar kontrol/akustik özellik ayrımına dayanak; bu projede ölçülmüş duygu başarısı değiller.
