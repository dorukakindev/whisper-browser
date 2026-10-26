# Rapor610 — YouTube0:00 döngüsü,asistan arama sınırı ve Task02 ön incelemesi

Başlangıç master:`3f21f4fa5d68e3487168aa1222ba30ba1863940f`. Ürün bitişi:`dd7fcc7f23333c35a08381c78d37b0b1e0a1c343`. Dal:codex/youtube-loop610. Depo:https://github.com/dorukakindev/whisper-browser.

## YouTube kökü ve onarım
Kullanıcının ekranındaki Antinatalizm videosu (`9SzAXcsc67c`) ayrı/geçici Windows Electron profiliyle test edildi;kişisel oturum ve açık uygulama kullanılmadı. Reklam engelleme açık.

Önceki iki geçerli canlı koşumda15×2saniye yoklamada time0,readyState0,duration4854,playabilityOK;adPlayingfalse. Ağda googlevideo/videoplayback XHR ERR_FAILED ve bir DNS hatası vardı;Ghostery yalnız reklam alanlarını engellemişti. Yani bu koşumda sorun yalnız otomatik reklam atlama değildi.

Asıl kök:installYoutubeStreamHeaders CDN'nin kendi Access-Control-Allow-Origin değerini koşulsuz `*` ile eziyordu;farklı büyük/küçük harfle ikinci başlık da ekleyebiliyordu. Kimlik bilgili YouTube medya isteğinde CORS reddi oluşabiliyor. Yeni saf youtube-stream-headers yordamı sunucunun mevcut origin/credentials/headercase değerini korur;birinci taraf YouTube Origin/Referer değiştirilmez. Uygulama kaynaklı mevcut dar googlevideo uyarlaması sürer. Filtre motoru,site aç/kapat ayarı ve reklam listeleri kapatılmadı.

Aynı URL düzeltme sonrası15yoklamada time24.876362,readyState4,duration4853.741;videoplayback200. Gerçek video görüntüsü .uiprev/youtube610-1793024213605/youtube.png incelendi. Önce .uiprev/youtube610-1793024006715 ve1793024124700;sonuç JSONları kişisel olmayan geçici kanıt,Git'e alınmadı. İlk1793023843206denemede sekme açma sırası yanlış olduğundan samplesboştu;bu geçerli kabul koşumu sayılmadı.

## Ek iki koruma
- skipAd yalnız reklam işaretine bakıp uzun asıl videoyu sona sarıyordu. Artık bilinen ana video süresiyle eşleşen,uzun(>180s) veya süresi belirsiz medya sona sarılmaz/sessize alınmaz;görünür gerçek Atla düğmesi varsa kullanılabilir. Kısa güvenli reklam medyasında kaynak+süre kimliğine yalnız bir seek;Atla3denemeyle ve1500msaralıkla sınırlı. Reklamdan ana videoya geçerken sınıf bayat kalsa da kendi mutekararı geri alınır,kullanıcı ses tercihi ezilmez. Kimlik aynı kalan çok uzun reklam için agresif seekyapılmaması bilinçli güvenlik tercihidir.
- Deneysel CDPplayeryanıt budaması redirect/non2xx/ağhatasında gövde okumaya çalışmaz;özgün yanıtı sürdürür. Varsayılan deneysel ayar değiştirilmedi. Genel gövde okuma timeoutu bu turda eklenmedi;CDPbelgesi okuma sürerken isteği değiştirmeyi tanımsız davranış diye belirtir.

## Testler
Son8hedefli komut exit0:browser-media-controller37kontrol;headercase/credentials/firstpartyve redirectgerçekhandlerprobe;adblockUI/motor ve606regresyonları;YouTubeguard/CDPsözleşmeleri;JScheck;gerçek Electron CORSsmoke. Önceki9hedefli komut da geçti,ayrıca mevcut electron-adblock.smoke başarılı.

Yeni electron-youtube-cors610.smoke:iki loopbackorigin ve credentialsinclude. Eski zorlanmış wildcardnegatifkontrol fetchreddeder;yeni başlıkla media-okgelir. Aynı Session/Ghosteryaktifken ad.jsengellenir. Ağ/nativekanıt modelmockdeğildir;canlı video kabulü ise tekvideo/oturuma aittir,tümYouTubehesapları veya gelecektekireklamdeğişiklikleri garantisi değildir.

Değişen dosyalar:src/youtube-stream-headers.js(safCORSbaşlıkları),src/main.js(darkapsamlıCDNentegrasyon+non2xxCDPguard),src/browser-media-controller.js(sahiplikli/sınırlıadkomutu),tests/browser-media-controller.test.js(tekrar/uzunvideo/shortmain/muterestore),tests/youtube-stream-headers.test.js(case/firstparty/redirect),tests/electron-youtube-cors610.smoke.js(nativecredentialsveadblock).

Bağımlılık/kurulum/şema değişmedi. Kişisel start.bat oturumu yeniden başlatılmadı;izole Electron gerçek Windows koşuldu. GPU/DRM veya ücretli servis kullanılmadı. UzunCI/tamnpmpaketi beklenmedi;CI açık.

## Asistan internet sorusu
Koddan doğrulandı:backend/transcribe.py build_chat_prompt açık video/sayfa/kitap bağlamına dayalı yardım ister;genel bilgi istisnası çoğunlukla dilbilgisi içindir. Gerçek sohbet çağrısında websearcharacı bağlı değildir. Model/endpoint seçmek tek başına webarama sağlamaz. Bu yüzden kişi biyografisi bağlamda yokken dışarıdan araştırmıyor. Bu turda arama sağlayıcısı veya ücretli araç eklenmedi;bu bir ağkesintisi teşhisi değildir.

Sonraki ürün adımı:ayrı sayfa/video kapsamı ve Web'de araştır eylemi;güvenli arama/okuma servisi,gerçek URLkaynakları,iptal/bayatsonuç ve gizlilik sınırlarıyla bağlanmalı. Araç yokken aradığını iddia eden promptdeğişikliği yapılmamalı.

## Task02 paketi — ön triyaj,henüz tüm bulgular doğrulanmadı
Dosya:TASK-02-96b204f1-AUDIT.zip. SHA256:`e3e781a0e927475cc37a3259fc5984a2f66836ec2c27695c22700c72428eb2ba`. ZIPCRCgeçti;bildirilen kaynak96b204f1,1539manifestkaydı ve22kök kayıt. Paket saltdenetimdir;patchyok. Rapor/probe/kısıtlar okundu,harici kod otomatik çalıştırılmadı.

Güncel ürün saf işlevlerinde doğrudan yeniden üretildi:
- F01:Honestly, I'm tired.→Açıkçası yorgunum. part_anchor_issue=ozel_ad_kaydi:0.
- F02:Ahmet's car is here.→Ahmet'in arabası burada. ozel_ad_bozulma:0.
- F03:Doctor, may I come in?→Doktor,girebilir miyim? ozel_ad_bozulma:0.
- F15:insert_sentence_breaks('<i>Dur. Burada bekle.</i>') kapanıştan önce fazladan newlineekliyor.
- F06gözlemi:I like it.→Onu sevmiyorum. mevcut blocking/anchorboş. Bu anlamkapısı kapsam açığıdır;tüm olumsuzluk eklemelerini basit bir regexle engellemek yanlışret riski taşır.

Bu çeviri bulguları BU TURDA ONARILMADI;önce özelad/çekim/olumsuzluknegatifkontrolleriyle ayrı düzeltme gerekir. F04–F05,F07–F14,F16–F22tümü bağımsız yeniden doğrulanmış sayılmaz. Özellikle F14cachehitkalitesayacını sıfırlama önceki tasarım kararıyla çelişen bir öneridir;otomatik bugkabul edilmez. İki TEST_CONTRACT ve bir SUSPECTED kayıt19runtimeiddiasıyla karıştırılmamalı. PaketLinux/ağkapalı/SDKshim;gerçekmodel/GPU/Electronbaşarısı iddiası yok.

## Kaynak protokol belgeleri
https://www.electronjs.org/docs/latest/api/web-request
https://chromedevtools.github.io/devtools-protocol/tot/Fetch/
Bunlar listener/pausedresponse davranışı içindir;ürün düzeltmesinin ana kanıtı yukarıdaki gerçek/negatif kontrol koşumlarıdır.
