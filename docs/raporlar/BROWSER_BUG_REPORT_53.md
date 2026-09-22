# Browser Bug Report 51 - Bagimsiz dogrulama ve ret dokumu

Tarih: 2026-09-16
Incelenen commit: 9969a1363cd876bb260d9b1760e1d159725c1d79
Kaynak: BROWSER_BUG_REPORT_51.md
Calisma bicimi: Salt okunur urun denetimi. Urun kodu duzeltilmedi.

## Sonuc

Rapor 51'deki 115 maddenin tumu gercek ve dogrulanmis degildir.

| Sinif | Sayi | Karar |
|---|---:|---|
| A - Gercek | 56 | Prob veya ulasilabilir deterministik kaynak akisi yeterli. Duzeltme isi acilabilir. |
| B - Kismen gercek | 26 | Bosluk var; etki, onem veya kok neden ifadesi abartili/eksik. Once kapsam daraltilmali. |
| C - Gercek degil | 17 | Koruma, bilincli tasarim veya ulasilabilirlik siniri iddiayi curutuyor. Duzeltilmemeli. |
| D - Dogrulanmadi | 16 | Electron yarisi, gercek site veya hata enjeksiyonu repro'su gerekiyor. |

## A - Gercek bulgular (56)

R51-01, 02, 03, 04, 05, 06, 10, 12, 17, 18, 21, 23, 25, 26, 27, 30, 31, 33, 34, 35, 37, 38, 39, 40, 41, 44, 48, 49, 51, 52, 54, 55, 56, 59, 62, 66, 70, 72, 74, 75, 80, 81, 85, 88, 89, 90, 92, 94, 97, 98, 101, 108, 109, 111, 113, 114.

Guclu kanitli alt kume:
- R51-02, 06, 30, 34, 35, 38, 54 ve 55 raporun calistirilmis problariyla gercekten dogrulandi.
- R51-27 kesin: media:listFolder klasoru depth=0 ile aciyor, her girdiyi depth=1 cagiriyor; maxDepth=0 tum dosyalari donusten once eliyor.
- R51-31 kesin: normal dosya kuyrugu ayni cikti klasorunde kaynak kok adini kullaniyor. Benzersiz outputNameSuffix yalniz browser-Whisper akimina veriliyor.
- R51-49 kesin: stop komutu stop_event'i hemen kuruyor; Python kuyrugu bosaltmadan cikiyor ve islenen parcanin segment dongusu de erken kesiliyor.
- R51-80 kesin: favicon temizleyici HTTP/HTTPS kabul ediyor; renderer CSP img-src altinda HTTPS'e izin vermiyor.
- R51-01 kaynakta ulasilabilir bir yetki zinciri. Crafted wspak + restart e2e kabul testi henuz yok; duzeltmeden sonra zorunlu.

## B - Kismen gercek (26)

R51-07, 08, 09, 15, 36, 42, 43, 50, 60, 61, 63, 64, 69, 71, 73, 76, 78, 84, 87, 93, 100, 103, 104, 105, 107, 115.

- R51-07: Izin sirasi gercek; ama izin kullanicinin ice aktardigi site allowlist'inden geliyor. P2 keyfi arka plan izni etkisi kanitlanmadi.
- R51-08: Anahtar cogu senaryoda fiziksel silinmiyor; kasa anahtari UI/konfigurasyondan gizlenip ozellik kiriliyor.
- R51-09: grantMedia diyalogu atliyor; yol kullanicinin acikca ice aktardigi katalogdan geliyor. Tehdit modeli olmadan P2 denemez.
- R51-15: mediaId/generation yoklugu saglamlik boslugu; tab ve ana-surec baglam denetimleri tamamen yok degil.
- R51-36: Yerel OSD gizli, fakat browser sinyal/uyari yuzeyi var. Butun geri bildirim kaybolmuyor.
- R51-42: Browser ceviri/manga yolu SDK degil dogrudan fetch kullaniyor. max_retries eksigi backend istemcilerinin bir bolumunde gercek.
- R51-43: Bazi moduller ham spawn kullaniyor; UI anahtarlari normalde ebeveyn process.env'e yazilmiyor. Risk uygulama gizli env ile baslatilirsa var.
- R51-50: Normal durumda ikili arama + prefix maksimumu var; O(cue x translation) ancak yogun cakisan kotu durumda. Benchmark gerekli.
- R51-60: Test kapsami sorunu, kullaniciya ulasan urun bug'i degil.
- R51-61: Eski manga adayinin modele gitmesi normal renderer yolunu atlayan dogrudan IPC kosulunda gosterilmis.
- R51-63: Dis tikla taslak kapatma UX tercihi olabilir; kaydetmeden kapatma uyarisi ayri iyilestirmedir.
- R51-64: Sayfanin overlay dugumunu silmesi mumkun; gercek-site repro'su yok.
- R51-69: Seri cache/fallback verimsizligi; dogruluk veya veri kaybi bug'i degil.
- R51-71: O(N) tarama var; sinir-zamanlayici surekli kare calismasini azaltiyor. Profil olcumu gerekli.
- R51-73: Gelismis VTT/IMSC sunum uyumlulugu eksik; temel metin yakalama bozuk degil.
- R51-76: Tek font fallback var; tofu sonucu sistem fontlarina bagli. Gorsel fixture gerekli.
- R51-78: Terminoloji sistem prompt'una giriyor, fakat guvenilmez-veri kurali ve karakter/toplam butceler var. Basarili enjeksiyon kanitlanmadi.
- R51-84: Tek gecersiz sayi ayar kaydini reddeder; normal UI ve import bunu sinirlar. Ulasilabilir kullanici yolu gerekli.
- R51-87: Uyelik denetimi yok; olay yalniz uygulamanin kendi Python cocugundan geliyor. Keyfi-yol silme acigi olarak sunulamaz.
- R51-93: Islevsel hata degil, onceki aday hata ayrintisinin kaybi.
- R51-100: Negatif cache yoklugu kota/performans iyilestirmesi.
- R51-103: Passive listener boslugu gercek; reflow patlamasi olculmedi.
- R51-104: Uyumluluk modunun kullanici-tetikli manga enjeksiyonunu da kapatacagi urun sozlesmesi net degil.
- R51-105: Transform/fixed-overlay etkisi siteye bagli; gorsel repro gerekli.
- R51-107: HTTP sayfa zaten acik metin. HTTPS zorunlulugu savunma sertlestirmesi olarak ele alinmali.
- R51-115: Electron smoke ve soak ayri, acik adli scriptler. Kapsam envanteri iyilestirilebilir; urun bug'i degil.

## C - Gercek degil, bug olarak reddedildi (17)

R51-11, 14, 20, 32, 45, 65, 67, 68, 79, 82, 83, 95, 96, 102, 106, 110, 112.

- R51-11: Anki medyasi uygulama not deposundan gelir; exporter uzanti, dosya ve boyut sinirlari uygular. Guvenilmeyen girisle keyfi dosya sizintisi yolu gosterilmedi.
- R51-14: handled:false adayda komut uygulanmadigini belirtir; sonraki adayi denemek dogru fallback'tir.
- R51-20: Sifir cue iceren video segmenti normaldir. Decoder firlatirsa tamam isaretine ulasilmaz; sifir cue'yu hata saymak sonsuz tekrar dogurur.
- R51-32: Yeniden baslatmada yerel dosya iznini yeniden istemek kalici grant saklamama guvenlik tercihidir.
- R51-45: Kapatilan sekmeden sonra aktif olacak hibernasyonlu komsunun view'ini kurmak beklenen davranistir.
- R51-65: Manga balonunun tiki almasi duzenleme/etkilesim ozelligidir.
- R51-67: Canvas/CSS/shadow/iframe kapsami yeni destek ozelligidir; document.images yolu bozuk degildir.
- R51-68: Ordinal konum geri yukleme yaklasik fallback'tir; yanlis oge repro'su yok.
- R51-79: Kaynak curutuyor. createTerminologyMap en cok 100 terim/6000 karakter; uretim 40/1800 veya 60/2400. Backend sozluk de 200/6000 ile sinirli.
- R51-82: Sayfa odaginda medya tuslarini siteye birakmak tarayici uyumlulugu tercihidir.
- R51-83: Tercihi butun frame/videolara uygulamak yanlis videolari degistirebilir; ilk handled medya hedef secimidir.
- R51-95: Gecmisin son deneme sonucunu gostermesi gecerli veri modelidir.
- R51-96: Sirlar guvenlik nedeniyle kuyruk snapshot'ina yazilmaz; calisma aninda guncel kasadan eklenmesi zorunludur.
- R51-102: Tuketilmeyen olay olu koddur; kullanici etkisi yok.
- R51-106: Yalniz yaniltici degisken adi; rapor da davranisin dogru oldugunu soyluyor.
- R51-110: Node/V8 probunda 80.000 ve 100.000 arguman gecti, 125.000'de RangeError oldu. Urunun ulasilabilir boundaries ust siniri 80.000.
- R51-112: MediaSession/global media-key yoklugu regresyon degil yeni ozellik onerisi.

## D - Dogrulanmadi, once repro gerekli (16)

R51-13, 16, 19, 22, 24, 28, 29, 46, 47, 53, 57, 58, 77, 86, 91, 99.

- R51-13: Gecikmeli executeJavaScript ile sekme/frame degisimi yarisi; eski videoda gercek mutasyon gosterilmeli.
- R51-16: SERVICE1 manifest + cc708_1 decoder ciktili CEA-708 fixture gerekli.
- R51-19: Segment yanitlari ters sirada tamamlanan HLS fixture gerekli.
- R51-22: Session import ve mevcut-view hizli yolu birlikte calistirilmali; view/tab ayrismasi gosterilmeli.
- R51-24: Sifir olmayan olcek/ofsetle anlamsal arama tiklamasi olculmeli.
- R51-28, 29, 53: persist/spawn arasinda kontrollu iptal veya renderer reload yarisi gerekli.
- R51-46: Crash retry timer kurulurken unload/close yarisi gerekli.
- R51-47: View kurulumunun kontrollu reddedildigi browser:show testi gerekli.
- R51-57: Aktif output transaction sirasinda app close testi gerekli.
- R51-58: Eski playerJobEvent yeni kuyruk isi sirasinda enjekte edilmeli.
- R51-77: JASSUB canvas + HTML overlay'in ayni anda gorundugu ekran/DOM kaniti gerekli.
- R51-86: NaN zamanin noktalama kurtarmadan gecip ciktiyi geri aldigi fixture gerekli.
- R51-91: Mini-player kapanirken parent yok edilmis Electron testi gerekli.
- R51-99: done ardindan nonzero exit terminal durumu testi gerekli.

## Diger yapay zeka icin uygulama kurali

1. Yalniz A sinifini dogrudan duzeltme kuyruguna al.
2. B sinifinda bu rapordaki dar kapsam icin once test yaz.
3. C sinifini duzeltme; guvenlik veya dogru fallback davranisini bozabilir.
4. D sinifinda kirmizi deterministik repro olmadan urun kodunu degistirme.
5. Her duzeltmede hedefli regresyon, npm test ve gerektiginde Electron/gercek-site kabulu uygula.

## Bu dogrulamada calistirilan ek kanit

- Math.min spread: 80.000 ve 100.000 gecti; 125.000 ve 150.000 RangeError verdi.
- scanMediaFromPaths derinlik akisi incelendi; R51-27 kesinlesti.
- Terminoloji merkezi butceleri ve uretim cagirilari incelendi; R51-79 reddedildi.
- Provider yollari incelendi; R51-42 daraltildi.
- Urun test paketi calistirilmadi ve urun koduna dokunulmadi; gorev bug duzeltmek degil rapor iddialarini ayirmakti.
