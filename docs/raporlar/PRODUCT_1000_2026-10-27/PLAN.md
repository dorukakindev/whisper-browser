# 1000 hedef — yeni ürün derinleştirme çalışması

Başlangıç 27 Ekim2026 09:26 Europe/Istanbul; yaklaşık10 saatlik pencere19:26'ya kadar. Kesintisiz çalışma veya1000 tamamlanmış geliştirme garantisi değildir. Aktif kalıcı hedef bu çalışmadır; ikinci kopya otomatik iş başlatılmaz.

Önceki100 maddelik çalışma ve DeepSeek-NIGHT1000 read-only paketi ayrıdır. Bu liste54 gerçek uygulama aracı ve46 gerçek ürün modülünde10'ar farklı risk/kabul koşulunu kapsar. Toplam1000,1000 yeni bug veya1000 özellik değildir. Araç incelemelerinde schema ve mevcut dispatch yolu birlikte incelenir; pipeline incelemelerinde satırdaki kaynak gerçek fonksiyona daraltılır. Uygulanmayan koşul gerekçesiyle UYGULANMAZ olarak kapanır; ürün bugı diye sayılmaz. Aynı kök düzeltme tek bulgu, etkilediği kabul maddeleri ayrı kayıttır.

## Çalışma yöntemi

- Öncelik ses/çeviri/Whisper/kitap/asistan; önce somut kayıp veya kullanılamama kanıtı.
- Yeni test sayısı değil önemli davranış kanıtı. Önce mevcut kısa kontroller, boşluk varsa hedefli probe/regresyon; UI için ayrı profilde gerçek Windows görüntüsü.
- Geçti/uygulandı yalnız çalıştırılan komut, SHA ve sınırla kaydedilir. Fixture gerçek GPU/provider/site/ses kalitesi değildir. Canlı erişim yoksa DOĞRULANMADI olarak açık kalır.
- Tamamlanan paketler ayrı ürün/belge commit→normal push→PR→master→kişisel dosyaları koruyan ana kopya güncellemesi. CI arkada; sonucu beklenmez.
- Kişisel açık uygulama, API anahtarı ve kullanıcı medyası test profili değildir. Yedek/kurtarma bakımını gereksiz büyütme.
- Her paket yeni seri rapor ve devir; TASKS.json kanonik durum, bu md okunur görünüm. Geçmiş işlemleri silme. Yarım işi TODO kodu olarak teslim etme.

## Paket günlüğü

İlk odak: motor hazır olma/son grup/referans cache zinciri ve kitap kalite raporunun eksik grup kapsamı. Bunlar henüz doğrulanmış bug olarak kaydedilmemiş inceleme başlıklarıdır.

| ID | Ürün işlemi | İnceleme / kabul | Kaynak | Durum | Kanıt |
|---|---|---|---|---|---|
| P0001 | Uygulama yardımı [app_help] | Geçerli bağlam: Mevcut seçili kaynak ve gerçek kimlikle çağır; yalnız bu kaynağın kanıtını döndür. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0002 | Uygulama yardımı [app_help] | Boş sonuç: Eşleşen veri yokken boş/uygunsuz durumunu açık göster; sonuç uydurma. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0003 | Uygulama yardımı [app_help] | Kaynak revizyonu: Okuma beklerken kaynak/sekme değiştir; eski veriyi yeni kaynağa yazma. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0004 | Uygulama yardımı [app_help] | Sohbet değişimi: Bekleyen sonuç başka sohbete taşınmasın; sahiplik kontrolü sonda da yapılsın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0005 | Uygulama yardımı [app_help] | İptal/süre sınırı: İptal veya deadline aşımından sonra tamamlandı kartı üretme. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0006 | Uygulama yardımı [app_help] | Sınır ve sayfalama: Uzun sonuç kesiliyorsa kapsam/sayfalama açık olsun; sonraki kimlik erişilebilir kalsın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0007 | Uygulama yardımı [app_help] | Hata ayrımı: Kontrollü servis hatasını boş başarılı sonuç gibi sunma. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0008 | Uygulama yardımı [app_help] | Unicode ve satırlar: Türkçe harf, birleşen işaret ve satır sonunu kaynak metninde koru. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0009 | Uygulama yardımı [app_help] | Yetki ve veri: Ham dosya yolu, anahtar veya farklı kaynak verisini modele döndürme. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0010 | Uygulama yardımı [app_help] | Tekrar ve odak: Tekrarlanan okuma yan etki başlatmasın; dar panelde odak/mesaj erişilsin. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0011 | Açık kaynağı oku [get_source_context] | Geçerli bağlam: Mevcut seçili kaynak ve gerçek kimlikle çağır; yalnız bu kaynağın kanıtını döndür. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0012 | Açık kaynağı oku [get_source_context] | Boş sonuç: Eşleşen veri yokken boş/uygunsuz durumunu açık göster; sonuç uydurma. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0013 | Açık kaynağı oku [get_source_context] | Kaynak revizyonu: Okuma beklerken kaynak/sekme değiştir; eski veriyi yeni kaynağa yazma. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0014 | Açık kaynağı oku [get_source_context] | Sohbet değişimi: Bekleyen sonuç başka sohbete taşınmasın; sahiplik kontrolü sonda da yapılsın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0015 | Açık kaynağı oku [get_source_context] | İptal/süre sınırı: İptal veya deadline aşımından sonra tamamlandı kartı üretme. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0016 | Açık kaynağı oku [get_source_context] | Sınır ve sayfalama: Uzun sonuç kesiliyorsa kapsam/sayfalama açık olsun; sonraki kimlik erişilebilir kalsın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0017 | Açık kaynağı oku [get_source_context] | Hata ayrımı: Kontrollü servis hatasını boş başarılı sonuç gibi sunma. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0018 | Açık kaynağı oku [get_source_context] | Unicode ve satırlar: Türkçe harf, birleşen işaret ve satır sonunu kaynak metninde koru. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0019 | Açık kaynağı oku [get_source_context] | Yetki ve veri: Ham dosya yolu, anahtar veya farklı kaynak verisini modele döndürme. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0020 | Açık kaynağı oku [get_source_context] | Tekrar ve odak: Tekrarlanan okuma yan etki başlatmasın; dar panelde odak/mesaj erişilsin. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0021 | İş durumunu oku [get_job_status] | Geçerli bağlam: Mevcut seçili kaynak ve gerçek kimlikle çağır; yalnız bu kaynağın kanıtını döndür. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0022 | İş durumunu oku [get_job_status] | Boş sonuç: Eşleşen veri yokken boş/uygunsuz durumunu açık göster; sonuç uydurma. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0023 | İş durumunu oku [get_job_status] | Kaynak revizyonu: Okuma beklerken kaynak/sekme değiştir; eski veriyi yeni kaynağa yazma. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0024 | İş durumunu oku [get_job_status] | Sohbet değişimi: Bekleyen sonuç başka sohbete taşınmasın; sahiplik kontrolü sonda da yapılsın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0025 | İş durumunu oku [get_job_status] | İptal/süre sınırı: İptal veya deadline aşımından sonra tamamlandı kartı üretme. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0026 | İş durumunu oku [get_job_status] | Sınır ve sayfalama: Uzun sonuç kesiliyorsa kapsam/sayfalama açık olsun; sonraki kimlik erişilebilir kalsın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0027 | İş durumunu oku [get_job_status] | Hata ayrımı: Kontrollü servis hatasını boş başarılı sonuç gibi sunma. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0028 | İş durumunu oku [get_job_status] | Unicode ve satırlar: Türkçe harf, birleşen işaret ve satır sonunu kaynak metninde koru. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0029 | İş durumunu oku [get_job_status] | Yetki ve veri: Ham dosya yolu, anahtar veya farklı kaynak verisini modele döndürme. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0030 | İş durumunu oku [get_job_status] | Tekrar ve odak: Tekrarlanan okuma yan etki başlatmasın; dar panelde odak/mesaj erişilsin. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0031 | İşi durdur [cancel_job] | Öneri sınırı: Araç önerisi tek başına işi/ücreti/kalıcı değişikliği başlatmasın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0032 | İşi durdur [cancel_job] | Gerçek kabul: Kullanıcı uygulayınca mevcut uygulama kapısına tam bir defa bağlan; accepted ile completed ayrımını koru. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0033 | İşi durdur [cancel_job] | Kaynak değişimi: Onaydan önce kaynak/sekme değişirse eski karta yan etki yaptırma. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0034 | İşi durdur [cancel_job] | Sohbet/deadline: Bekleyen eylem sohbet değişimi veya süresi dolunca yeni bağlama uygulanmasın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0035 | İşi durdur [cancel_job] | İptal yarışı: Başlangıç beklerken iptal et; henüz başlamayan alt işi başlatma, başladıysa exact işin sonucunu raporla. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0036 | İşi durdur [cancel_job] | Kimlik ve değer: Geçersiz kimlik/aralık/enum ile mevcut kullanıcı verisini değiştirme; düzeltilebilir hata göster. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0037 | İşi durdur [cancel_job] | Çift uygulama: Hızlı iki uygulama/tekrar tıklama ikinci eşzamanlı işi veya aynı kalıcı değişikliği üretmesin. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0038 | İşi durdur [cancel_job] | Kontrollü ret: Mevcut servis ok:false/exception döndürürse başarı kartına dönüştürme. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0039 | İşi durdur [cancel_job] | Seçenek aktarımı: Hedef dil/zaman aralığı/normal seçenekler yalnız seçili işlemin payloadunda doğru kalsın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0040 | İşi durdur [cancel_job] | Sonuç ve erişim: Başarı/partial/hata sonrası gerçek çıktı veya yeniden deneme erişilsin; dar EN/TR panelde düğmeler kaybolmasın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0041 | YouTube altyazılarını bul [probe_video_captions] | Geçerli bağlam: Mevcut seçili kaynak ve gerçek kimlikle çağır; yalnız bu kaynağın kanıtını döndür. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0042 | YouTube altyazılarını bul [probe_video_captions] | Boş sonuç: Eşleşen veri yokken boş/uygunsuz durumunu açık göster; sonuç uydurma. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0043 | YouTube altyazılarını bul [probe_video_captions] | Kaynak revizyonu: Okuma beklerken kaynak/sekme değiştir; eski veriyi yeni kaynağa yazma. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0044 | YouTube altyazılarını bul [probe_video_captions] | Sohbet değişimi: Bekleyen sonuç başka sohbete taşınmasın; sahiplik kontrolü sonda da yapılsın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0045 | YouTube altyazılarını bul [probe_video_captions] | İptal/süre sınırı: İptal veya deadline aşımından sonra tamamlandı kartı üretme. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0046 | YouTube altyazılarını bul [probe_video_captions] | Sınır ve sayfalama: Uzun sonuç kesiliyorsa kapsam/sayfalama açık olsun; sonraki kimlik erişilebilir kalsın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0047 | YouTube altyazılarını bul [probe_video_captions] | Hata ayrımı: Kontrollü servis hatasını boş başarılı sonuç gibi sunma. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0048 | YouTube altyazılarını bul [probe_video_captions] | Unicode ve satırlar: Türkçe harf, birleşen işaret ve satır sonunu kaynak metninde koru. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0049 | YouTube altyazılarını bul [probe_video_captions] | Yetki ve veri: Ham dosya yolu, anahtar veya farklı kaynak verisini modele döndürme. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0050 | YouTube altyazılarını bul [probe_video_captions] | Tekrar ve odak: Tekrarlanan okuma yan etki başlatmasın; dar panelde odak/mesaj erişilsin. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0051 | YouTube altyazısını çevir [translate_video_captions] | Öneri sınırı: Araç önerisi tek başına işi/ücreti/kalıcı değişikliği başlatmasın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0052 | YouTube altyazısını çevir [translate_video_captions] | Gerçek kabul: Kullanıcı uygulayınca mevcut uygulama kapısına tam bir defa bağlan; accepted ile completed ayrımını koru. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0053 | YouTube altyazısını çevir [translate_video_captions] | Kaynak değişimi: Onaydan önce kaynak/sekme değişirse eski karta yan etki yaptırma. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0054 | YouTube altyazısını çevir [translate_video_captions] | Sohbet/deadline: Bekleyen eylem sohbet değişimi veya süresi dolunca yeni bağlama uygulanmasın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0055 | YouTube altyazısını çevir [translate_video_captions] | İptal yarışı: Başlangıç beklerken iptal et; henüz başlamayan alt işi başlatma, başladıysa exact işin sonucunu raporla. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0056 | YouTube altyazısını çevir [translate_video_captions] | Kimlik ve değer: Geçersiz kimlik/aralık/enum ile mevcut kullanıcı verisini değiştirme; düzeltilebilir hata göster. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0057 | YouTube altyazısını çevir [translate_video_captions] | Çift uygulama: Hızlı iki uygulama/tekrar tıklama ikinci eşzamanlı işi veya aynı kalıcı değişikliği üretmesin. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0058 | YouTube altyazısını çevir [translate_video_captions] | Kontrollü ret: Mevcut servis ok:false/exception döndürürse başarı kartına dönüştürme. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0059 | YouTube altyazısını çevir [translate_video_captions] | Seçenek aktarımı: Hedef dil/zaman aralığı/normal seçenekler yalnız seçili işlemin payloadunda doğru kalsın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0060 | YouTube altyazısını çevir [translate_video_captions] | Sonuç ve erişim: Başarı/partial/hata sonrası gerçek çıktı veya yeniden deneme erişilsin; dar EN/TR panelde düğmeler kaybolmasın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0061 | İnternette araştır [research_web] | Geçerli bağlam: Mevcut seçili kaynak ve gerçek kimlikle çağır; yalnız bu kaynağın kanıtını döndür. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0062 | İnternette araştır [research_web] | Boş sonuç: Eşleşen veri yokken boş/uygunsuz durumunu açık göster; sonuç uydurma. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0063 | İnternette araştır [research_web] | Kaynak revizyonu: Okuma beklerken kaynak/sekme değiştir; eski veriyi yeni kaynağa yazma. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0064 | İnternette araştır [research_web] | Sohbet değişimi: Bekleyen sonuç başka sohbete taşınmasın; sahiplik kontrolü sonda da yapılsın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0065 | İnternette araştır [research_web] | İptal/süre sınırı: İptal veya deadline aşımından sonra tamamlandı kartı üretme. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0066 | İnternette araştır [research_web] | Sınır ve sayfalama: Uzun sonuç kesiliyorsa kapsam/sayfalama açık olsun; sonraki kimlik erişilebilir kalsın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0067 | İnternette araştır [research_web] | Hata ayrımı: Kontrollü servis hatasını boş başarılı sonuç gibi sunma. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0068 | İnternette araştır [research_web] | Unicode ve satırlar: Türkçe harf, birleşen işaret ve satır sonunu kaynak metninde koru. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0069 | İnternette araştır [research_web] | Yetki ve veri: Ham dosya yolu, anahtar veya farklı kaynak verisini modele döndürme. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0070 | İnternette araştır [research_web] | Tekrar ve odak: Tekrarlanan okuma yan etki başlatmasın; dar panelde odak/mesaj erişilsin. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0071 | Altyazıyı yükle [load_caption_track] | Öneri sınırı: Araç önerisi tek başına işi/ücreti/kalıcı değişikliği başlatmasın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0072 | Altyazıyı yükle [load_caption_track] | Gerçek kabul: Kullanıcı uygulayınca mevcut uygulama kapısına tam bir defa bağlan; accepted ile completed ayrımını koru. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0073 | Altyazıyı yükle [load_caption_track] | Kaynak değişimi: Onaydan önce kaynak/sekme değişirse eski karta yan etki yaptırma. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0074 | Altyazıyı yükle [load_caption_track] | Sohbet/deadline: Bekleyen eylem sohbet değişimi veya süresi dolunca yeni bağlama uygulanmasın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0075 | Altyazıyı yükle [load_caption_track] | İptal yarışı: Başlangıç beklerken iptal et; henüz başlamayan alt işi başlatma, başladıysa exact işin sonucunu raporla. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0076 | Altyazıyı yükle [load_caption_track] | Kimlik ve değer: Geçersiz kimlik/aralık/enum ile mevcut kullanıcı verisini değiştirme; düzeltilebilir hata göster. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0077 | Altyazıyı yükle [load_caption_track] | Çift uygulama: Hızlı iki uygulama/tekrar tıklama ikinci eşzamanlı işi veya aynı kalıcı değişikliği üretmesin. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0078 | Altyazıyı yükle [load_caption_track] | Kontrollü ret: Mevcut servis ok:false/exception döndürürse başarı kartına dönüştürme. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0079 | Altyazıyı yükle [load_caption_track] | Seçenek aktarımı: Hedef dil/zaman aralığı/normal seçenekler yalnız seçili işlemin payloadunda doğru kalsın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0080 | Altyazıyı yükle [load_caption_track] | Sonuç ve erişim: Başarı/partial/hata sonrası gerçek çıktı veya yeniden deneme erişilsin; dar EN/TR panelde düğmeler kaybolmasın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0081 | Altyazı düzenleyicisini aç [open_subtitle_editor] | Öneri sınırı: Araç önerisi tek başına işi/ücreti/kalıcı değişikliği başlatmasın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0082 | Altyazı düzenleyicisini aç [open_subtitle_editor] | Gerçek kabul: Kullanıcı uygulayınca mevcut uygulama kapısına tam bir defa bağlan; accepted ile completed ayrımını koru. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0083 | Altyazı düzenleyicisini aç [open_subtitle_editor] | Kaynak değişimi: Onaydan önce kaynak/sekme değişirse eski karta yan etki yaptırma. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0084 | Altyazı düzenleyicisini aç [open_subtitle_editor] | Sohbet/deadline: Bekleyen eylem sohbet değişimi veya süresi dolunca yeni bağlama uygulanmasın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0085 | Altyazı düzenleyicisini aç [open_subtitle_editor] | İptal yarışı: Başlangıç beklerken iptal et; henüz başlamayan alt işi başlatma, başladıysa exact işin sonucunu raporla. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0086 | Altyazı düzenleyicisini aç [open_subtitle_editor] | Kimlik ve değer: Geçersiz kimlik/aralık/enum ile mevcut kullanıcı verisini değiştirme; düzeltilebilir hata göster. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0087 | Altyazı düzenleyicisini aç [open_subtitle_editor] | Çift uygulama: Hızlı iki uygulama/tekrar tıklama ikinci eşzamanlı işi veya aynı kalıcı değişikliği üretmesin. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0088 | Altyazı düzenleyicisini aç [open_subtitle_editor] | Kontrollü ret: Mevcut servis ok:false/exception döndürürse başarı kartına dönüştürme. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0089 | Altyazı düzenleyicisini aç [open_subtitle_editor] | Seçenek aktarımı: Hedef dil/zaman aralığı/normal seçenekler yalnız seçili işlemin payloadunda doğru kalsın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0090 | Altyazı düzenleyicisini aç [open_subtitle_editor] | Sonuç ve erişim: Başarı/partial/hata sonrası gerçek çıktı veya yeniden deneme erişilsin; dar EN/TR panelde düğmeler kaybolmasın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0091 | Altyazı izlerini listele [list_subtitle_tracks] | Geçerli bağlam: Mevcut seçili kaynak ve gerçek kimlikle çağır; yalnız bu kaynağın kanıtını döndür. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0092 | Altyazı izlerini listele [list_subtitle_tracks] | Boş sonuç: Eşleşen veri yokken boş/uygunsuz durumunu açık göster; sonuç uydurma. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0093 | Altyazı izlerini listele [list_subtitle_tracks] | Kaynak revizyonu: Okuma beklerken kaynak/sekme değiştir; eski veriyi yeni kaynağa yazma. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0094 | Altyazı izlerini listele [list_subtitle_tracks] | Sohbet değişimi: Bekleyen sonuç başka sohbete taşınmasın; sahiplik kontrolü sonda da yapılsın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0095 | Altyazı izlerini listele [list_subtitle_tracks] | İptal/süre sınırı: İptal veya deadline aşımından sonra tamamlandı kartı üretme. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0096 | Altyazı izlerini listele [list_subtitle_tracks] | Sınır ve sayfalama: Uzun sonuç kesiliyorsa kapsam/sayfalama açık olsun; sonraki kimlik erişilebilir kalsın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0097 | Altyazı izlerini listele [list_subtitle_tracks] | Hata ayrımı: Kontrollü servis hatasını boş başarılı sonuç gibi sunma. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0098 | Altyazı izlerini listele [list_subtitle_tracks] | Unicode ve satırlar: Türkçe harf, birleşen işaret ve satır sonunu kaynak metninde koru. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0099 | Altyazı izlerini listele [list_subtitle_tracks] | Yetki ve veri: Ham dosya yolu, anahtar veya farklı kaynak verisini modele döndürme. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0100 | Altyazı izlerini listele [list_subtitle_tracks] | Tekrar ve odak: Tekrarlanan okuma yan etki başlatmasın; dar panelde odak/mesaj erişilsin. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0101 | Altyazıda ara [search_subtitles] | Geçerli bağlam: Mevcut seçili kaynak ve gerçek kimlikle çağır; yalnız bu kaynağın kanıtını döndür. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0102 | Altyazıda ara [search_subtitles] | Boş sonuç: Eşleşen veri yokken boş/uygunsuz durumunu açık göster; sonuç uydurma. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0103 | Altyazıda ara [search_subtitles] | Kaynak revizyonu: Okuma beklerken kaynak/sekme değiştir; eski veriyi yeni kaynağa yazma. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0104 | Altyazıda ara [search_subtitles] | Sohbet değişimi: Bekleyen sonuç başka sohbete taşınmasın; sahiplik kontrolü sonda da yapılsın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0105 | Altyazıda ara [search_subtitles] | İptal/süre sınırı: İptal veya deadline aşımından sonra tamamlandı kartı üretme. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0106 | Altyazıda ara [search_subtitles] | Sınır ve sayfalama: Uzun sonuç kesiliyorsa kapsam/sayfalama açık olsun; sonraki kimlik erişilebilir kalsın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0107 | Altyazıda ara [search_subtitles] | Hata ayrımı: Kontrollü servis hatasını boş başarılı sonuç gibi sunma. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0108 | Altyazıda ara [search_subtitles] | Unicode ve satırlar: Türkçe harf, birleşen işaret ve satır sonunu kaynak metninde koru. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0109 | Altyazıda ara [search_subtitles] | Yetki ve veri: Ham dosya yolu, anahtar veya farklı kaynak verisini modele döndürme. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0110 | Altyazıda ara [search_subtitles] | Tekrar ve odak: Tekrarlanan okuma yan etki başlatmasın; dar panelde odak/mesaj erişilsin. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0111 | Mevcut altyazıyı oku [get_current_subtitle] | Geçerli bağlam: Mevcut seçili kaynak ve gerçek kimlikle çağır; yalnız bu kaynağın kanıtını döndür. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0112 | Mevcut altyazıyı oku [get_current_subtitle] | Boş sonuç: Eşleşen veri yokken boş/uygunsuz durumunu açık göster; sonuç uydurma. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0113 | Mevcut altyazıyı oku [get_current_subtitle] | Kaynak revizyonu: Okuma beklerken kaynak/sekme değiştir; eski veriyi yeni kaynağa yazma. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0114 | Mevcut altyazıyı oku [get_current_subtitle] | Sohbet değişimi: Bekleyen sonuç başka sohbete taşınmasın; sahiplik kontrolü sonda da yapılsın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0115 | Mevcut altyazıyı oku [get_current_subtitle] | İptal/süre sınırı: İptal veya deadline aşımından sonra tamamlandı kartı üretme. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0116 | Mevcut altyazıyı oku [get_current_subtitle] | Sınır ve sayfalama: Uzun sonuç kesiliyorsa kapsam/sayfalama açık olsun; sonraki kimlik erişilebilir kalsın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0117 | Mevcut altyazıyı oku [get_current_subtitle] | Hata ayrımı: Kontrollü servis hatasını boş başarılı sonuç gibi sunma. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0118 | Mevcut altyazıyı oku [get_current_subtitle] | Unicode ve satırlar: Türkçe harf, birleşen işaret ve satır sonunu kaynak metninde koru. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0119 | Mevcut altyazıyı oku [get_current_subtitle] | Yetki ve veri: Ham dosya yolu, anahtar veya farklı kaynak verisini modele döndürme. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0120 | Mevcut altyazıyı oku [get_current_subtitle] | Tekrar ve odak: Tekrarlanan okuma yan etki başlatmasın; dar panelde odak/mesaj erişilsin. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0121 | Bu sahneye git [seek_to_time] | Öneri sınırı: Araç önerisi tek başına işi/ücreti/kalıcı değişikliği başlatmasın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0122 | Bu sahneye git [seek_to_time] | Gerçek kabul: Kullanıcı uygulayınca mevcut uygulama kapısına tam bir defa bağlan; accepted ile completed ayrımını koru. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0123 | Bu sahneye git [seek_to_time] | Kaynak değişimi: Onaydan önce kaynak/sekme değişirse eski karta yan etki yaptırma. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0124 | Bu sahneye git [seek_to_time] | Sohbet/deadline: Bekleyen eylem sohbet değişimi veya süresi dolunca yeni bağlama uygulanmasın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0125 | Bu sahneye git [seek_to_time] | İptal yarışı: Başlangıç beklerken iptal et; henüz başlamayan alt işi başlatma, başladıysa exact işin sonucunu raporla. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0126 | Bu sahneye git [seek_to_time] | Kimlik ve değer: Geçersiz kimlik/aralık/enum ile mevcut kullanıcı verisini değiştirme; düzeltilebilir hata göster. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0127 | Bu sahneye git [seek_to_time] | Çift uygulama: Hızlı iki uygulama/tekrar tıklama ikinci eşzamanlı işi veya aynı kalıcı değişikliği üretmesin. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0128 | Bu sahneye git [seek_to_time] | Kontrollü ret: Mevcut servis ok:false/exception döndürürse başarı kartına dönüştürme. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0129 | Bu sahneye git [seek_to_time] | Seçenek aktarımı: Hedef dil/zaman aralığı/normal seçenekler yalnız seçili işlemin payloadunda doğru kalsın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0130 | Bu sahneye git [seek_to_time] | Sonuç ve erişim: Başarı/partial/hata sonrası gerçek çıktı veya yeniden deneme erişilsin; dar EN/TR panelde düğmeler kaybolmasın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0131 | Çeviri önerisi [preview_translation_change] | Öneri sınırı: Araç önerisi tek başına işi/ücreti/kalıcı değişikliği başlatmasın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0132 | Çeviri önerisi [preview_translation_change] | Gerçek kabul: Kullanıcı uygulayınca mevcut uygulama kapısına tam bir defa bağlan; accepted ile completed ayrımını koru. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0133 | Çeviri önerisi [preview_translation_change] | Kaynak değişimi: Onaydan önce kaynak/sekme değişirse eski karta yan etki yaptırma. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0134 | Çeviri önerisi [preview_translation_change] | Sohbet/deadline: Bekleyen eylem sohbet değişimi veya süresi dolunca yeni bağlama uygulanmasın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0135 | Çeviri önerisi [preview_translation_change] | İptal yarışı: Başlangıç beklerken iptal et; henüz başlamayan alt işi başlatma, başladıysa exact işin sonucunu raporla. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0136 | Çeviri önerisi [preview_translation_change] | Kimlik ve değer: Geçersiz kimlik/aralık/enum ile mevcut kullanıcı verisini değiştirme; düzeltilebilir hata göster. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0137 | Çeviri önerisi [preview_translation_change] | Çift uygulama: Hızlı iki uygulama/tekrar tıklama ikinci eşzamanlı işi veya aynı kalıcı değişikliği üretmesin. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0138 | Çeviri önerisi [preview_translation_change] | Kontrollü ret: Mevcut servis ok:false/exception döndürürse başarı kartına dönüştürme. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0139 | Çeviri önerisi [preview_translation_change] | Seçenek aktarımı: Hedef dil/zaman aralığı/normal seçenekler yalnız seçili işlemin payloadunda doğru kalsın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0140 | Çeviri önerisi [preview_translation_change] | Sonuç ve erişim: Başarı/partial/hata sonrası gerçek çıktı veya yeniden deneme erişilsin; dar EN/TR panelde düğmeler kaybolmasın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0141 | Whisper işlemi [start_whisper] | Öneri sınırı: Araç önerisi tek başına işi/ücreti/kalıcı değişikliği başlatmasın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0142 | Whisper işlemi [start_whisper] | Gerçek kabul: Kullanıcı uygulayınca mevcut uygulama kapısına tam bir defa bağlan; accepted ile completed ayrımını koru. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0143 | Whisper işlemi [start_whisper] | Kaynak değişimi: Onaydan önce kaynak/sekme değişirse eski karta yan etki yaptırma. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0144 | Whisper işlemi [start_whisper] | Sohbet/deadline: Bekleyen eylem sohbet değişimi veya süresi dolunca yeni bağlama uygulanmasın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0145 | Whisper işlemi [start_whisper] | İptal yarışı: Başlangıç beklerken iptal et; henüz başlamayan alt işi başlatma, başladıysa exact işin sonucunu raporla. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0146 | Whisper işlemi [start_whisper] | Kimlik ve değer: Geçersiz kimlik/aralık/enum ile mevcut kullanıcı verisini değiştirme; düzeltilebilir hata göster. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0147 | Whisper işlemi [start_whisper] | Çift uygulama: Hızlı iki uygulama/tekrar tıklama ikinci eşzamanlı işi veya aynı kalıcı değişikliği üretmesin. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0148 | Whisper işlemi [start_whisper] | Kontrollü ret: Mevcut servis ok:false/exception döndürürse başarı kartına dönüştürme. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0149 | Whisper işlemi [start_whisper] | Seçenek aktarımı: Hedef dil/zaman aralığı/normal seçenekler yalnız seçili işlemin payloadunda doğru kalsın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0150 | Whisper işlemi [start_whisper] | Sonuç ve erişim: Başarı/partial/hata sonrası gerçek çıktı veya yeniden deneme erişilsin; dar EN/TR panelde düğmeler kaybolmasın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0151 | Mevcut altyazıyı çevir [translate_captions] | Öneri sınırı: Araç önerisi tek başına işi/ücreti/kalıcı değişikliği başlatmasın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0152 | Mevcut altyazıyı çevir [translate_captions] | Gerçek kabul: Kullanıcı uygulayınca mevcut uygulama kapısına tam bir defa bağlan; accepted ile completed ayrımını koru. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0153 | Mevcut altyazıyı çevir [translate_captions] | Kaynak değişimi: Onaydan önce kaynak/sekme değişirse eski karta yan etki yaptırma. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0154 | Mevcut altyazıyı çevir [translate_captions] | Sohbet/deadline: Bekleyen eylem sohbet değişimi veya süresi dolunca yeni bağlama uygulanmasın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0155 | Mevcut altyazıyı çevir [translate_captions] | İptal yarışı: Başlangıç beklerken iptal et; henüz başlamayan alt işi başlatma, başladıysa exact işin sonucunu raporla. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0156 | Mevcut altyazıyı çevir [translate_captions] | Kimlik ve değer: Geçersiz kimlik/aralık/enum ile mevcut kullanıcı verisini değiştirme; düzeltilebilir hata göster. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0157 | Mevcut altyazıyı çevir [translate_captions] | Çift uygulama: Hızlı iki uygulama/tekrar tıklama ikinci eşzamanlı işi veya aynı kalıcı değişikliği üretmesin. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0158 | Mevcut altyazıyı çevir [translate_captions] | Kontrollü ret: Mevcut servis ok:false/exception döndürürse başarı kartına dönüştürme. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0159 | Mevcut altyazıyı çevir [translate_captions] | Seçenek aktarımı: Hedef dil/zaman aralığı/normal seçenekler yalnız seçili işlemin payloadunda doğru kalsın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0160 | Mevcut altyazıyı çevir [translate_captions] | Sonuç ve erişim: Başarı/partial/hata sonrası gerçek çıktı veya yeniden deneme erişilsin; dar EN/TR panelde düğmeler kaybolmasın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0161 | Sayfayı çevir [translate_page] | Öneri sınırı: Araç önerisi tek başına işi/ücreti/kalıcı değişikliği başlatmasın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0162 | Sayfayı çevir [translate_page] | Gerçek kabul: Kullanıcı uygulayınca mevcut uygulama kapısına tam bir defa bağlan; accepted ile completed ayrımını koru. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0163 | Sayfayı çevir [translate_page] | Kaynak değişimi: Onaydan önce kaynak/sekme değişirse eski karta yan etki yaptırma. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0164 | Sayfayı çevir [translate_page] | Sohbet/deadline: Bekleyen eylem sohbet değişimi veya süresi dolunca yeni bağlama uygulanmasın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0165 | Sayfayı çevir [translate_page] | İptal yarışı: Başlangıç beklerken iptal et; henüz başlamayan alt işi başlatma, başladıysa exact işin sonucunu raporla. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0166 | Sayfayı çevir [translate_page] | Kimlik ve değer: Geçersiz kimlik/aralık/enum ile mevcut kullanıcı verisini değiştirme; düzeltilebilir hata göster. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0167 | Sayfayı çevir [translate_page] | Çift uygulama: Hızlı iki uygulama/tekrar tıklama ikinci eşzamanlı işi veya aynı kalıcı değişikliği üretmesin. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0168 | Sayfayı çevir [translate_page] | Kontrollü ret: Mevcut servis ok:false/exception döndürürse başarı kartına dönüştürme. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0169 | Sayfayı çevir [translate_page] | Seçenek aktarımı: Hedef dil/zaman aralığı/normal seçenekler yalnız seçili işlemin payloadunda doğru kalsın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0170 | Sayfayı çevir [translate_page] | Sonuç ve erişim: Başarı/partial/hata sonrası gerçek çıktı veya yeniden deneme erişilsin; dar EN/TR panelde düğmeler kaybolmasın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0171 | Ses durumunu oku [get_voice_status] | Geçerli bağlam: Mevcut seçili kaynak ve gerçek kimlikle çağır; yalnız bu kaynağın kanıtını döndür. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0172 | Ses durumunu oku [get_voice_status] | Boş sonuç: Eşleşen veri yokken boş/uygunsuz durumunu açık göster; sonuç uydurma. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0173 | Ses durumunu oku [get_voice_status] | Kaynak revizyonu: Okuma beklerken kaynak/sekme değiştir; eski veriyi yeni kaynağa yazma. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0174 | Ses durumunu oku [get_voice_status] | Sohbet değişimi: Bekleyen sonuç başka sohbete taşınmasın; sahiplik kontrolü sonda da yapılsın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0175 | Ses durumunu oku [get_voice_status] | İptal/süre sınırı: İptal veya deadline aşımından sonra tamamlandı kartı üretme. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0176 | Ses durumunu oku [get_voice_status] | Sınır ve sayfalama: Uzun sonuç kesiliyorsa kapsam/sayfalama açık olsun; sonraki kimlik erişilebilir kalsın. | `src/assistant-capabilities.js` | DÜZELTİLDİ | 4b425912febc84d5d3807321ee85ae4963a93193: gerçek Python100cue/249karakter planı key291; kalite doğrulama ve exact voice-status2000limit. Mevcut61grup pagination + native exactgetstatus ve not_checked kanıtı. |
| P0177 | Ses durumunu oku [get_voice_status] | Hata ayrımı: Kontrollü servis hatasını boş başarılı sonuç gibi sunma. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0178 | Ses durumunu oku [get_voice_status] | Unicode ve satırlar: Türkçe harf, birleşen işaret ve satır sonunu kaynak metninde koru. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0179 | Ses durumunu oku [get_voice_status] | Yetki ve veri: Ham dosya yolu, anahtar veya farklı kaynak verisini modele döndürme. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0180 | Ses durumunu oku [get_voice_status] | Tekrar ve odak: Tekrarlanan okuma yan etki başlatmasın; dar panelde odak/mesaj erişilsin. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0181 | Referans sesleri listele [list_voice_references] | Geçerli bağlam: Mevcut seçili kaynak ve gerçek kimlikle çağır; yalnız bu kaynağın kanıtını döndür. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0182 | Referans sesleri listele [list_voice_references] | Boş sonuç: Eşleşen veri yokken boş/uygunsuz durumunu açık göster; sonuç uydurma. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0183 | Referans sesleri listele [list_voice_references] | Kaynak revizyonu: Okuma beklerken kaynak/sekme değiştir; eski veriyi yeni kaynağa yazma. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0184 | Referans sesleri listele [list_voice_references] | Sohbet değişimi: Bekleyen sonuç başka sohbete taşınmasın; sahiplik kontrolü sonda da yapılsın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0185 | Referans sesleri listele [list_voice_references] | İptal/süre sınırı: İptal veya deadline aşımından sonra tamamlandı kartı üretme. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0186 | Referans sesleri listele [list_voice_references] | Sınır ve sayfalama: Uzun sonuç kesiliyorsa kapsam/sayfalama açık olsun; sonraki kimlik erişilebilir kalsın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0187 | Referans sesleri listele [list_voice_references] | Hata ayrımı: Kontrollü servis hatasını boş başarılı sonuç gibi sunma. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0188 | Referans sesleri listele [list_voice_references] | Unicode ve satırlar: Türkçe harf, birleşen işaret ve satır sonunu kaynak metninde koru. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0189 | Referans sesleri listele [list_voice_references] | Yetki ve veri: Ham dosya yolu, anahtar veya farklı kaynak verisini modele döndürme. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0190 | Referans sesleri listele [list_voice_references] | Tekrar ve odak: Tekrarlanan okuma yan etki başlatmasın; dar panelde odak/mesaj erişilsin. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0191 | Referans sesi seç [set_voice_reference] | Öneri sınırı: Araç önerisi tek başına işi/ücreti/kalıcı değişikliği başlatmasın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0192 | Referans sesi seç [set_voice_reference] | Gerçek kabul: Kullanıcı uygulayınca mevcut uygulama kapısına tam bir defa bağlan; accepted ile completed ayrımını koru. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0193 | Referans sesi seç [set_voice_reference] | Kaynak değişimi: Onaydan önce kaynak/sekme değişirse eski karta yan etki yaptırma. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0194 | Referans sesi seç [set_voice_reference] | Sohbet/deadline: Bekleyen eylem sohbet değişimi veya süresi dolunca yeni bağlama uygulanmasın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0195 | Referans sesi seç [set_voice_reference] | İptal yarışı: Başlangıç beklerken iptal et; henüz başlamayan alt işi başlatma, başladıysa exact işin sonucunu raporla. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0196 | Referans sesi seç [set_voice_reference] | Kimlik ve değer: Geçersiz kimlik/aralık/enum ile mevcut kullanıcı verisini değiştirme; düzeltilebilir hata göster. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0197 | Referans sesi seç [set_voice_reference] | Çift uygulama: Hızlı iki uygulama/tekrar tıklama ikinci eşzamanlı işi veya aynı kalıcı değişikliği üretmesin. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0198 | Referans sesi seç [set_voice_reference] | Kontrollü ret: Mevcut servis ok:false/exception döndürürse başarı kartına dönüştürme. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0199 | Referans sesi seç [set_voice_reference] | Seçenek aktarımı: Hedef dil/zaman aralığı/normal seçenekler yalnız seçili işlemin payloadunda doğru kalsın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0200 | Referans sesi seç [set_voice_reference] | Sonuç ve erişim: Başarı/partial/hata sonrası gerçek çıktı veya yeniden deneme erişilsin; dar EN/TR panelde düğmeler kaybolmasın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0201 | Yerel referans ses seç [pick_local_voice_reference] | Öneri sınırı: Araç önerisi tek başına işi/ücreti/kalıcı değişikliği başlatmasın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0202 | Yerel referans ses seç [pick_local_voice_reference] | Gerçek kabul: Kullanıcı uygulayınca mevcut uygulama kapısına tam bir defa bağlan; accepted ile completed ayrımını koru. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0203 | Yerel referans ses seç [pick_local_voice_reference] | Kaynak değişimi: Onaydan önce kaynak/sekme değişirse eski karta yan etki yaptırma. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0204 | Yerel referans ses seç [pick_local_voice_reference] | Sohbet/deadline: Bekleyen eylem sohbet değişimi veya süresi dolunca yeni bağlama uygulanmasın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0205 | Yerel referans ses seç [pick_local_voice_reference] | İptal yarışı: Başlangıç beklerken iptal et; henüz başlamayan alt işi başlatma, başladıysa exact işin sonucunu raporla. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0206 | Yerel referans ses seç [pick_local_voice_reference] | Kimlik ve değer: Geçersiz kimlik/aralık/enum ile mevcut kullanıcı verisini değiştirme; düzeltilebilir hata göster. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0207 | Yerel referans ses seç [pick_local_voice_reference] | Çift uygulama: Hızlı iki uygulama/tekrar tıklama ikinci eşzamanlı işi veya aynı kalıcı değişikliği üretmesin. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0208 | Yerel referans ses seç [pick_local_voice_reference] | Kontrollü ret: Mevcut servis ok:false/exception döndürürse başarı kartına dönüştürme. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0209 | Yerel referans ses seç [pick_local_voice_reference] | Seçenek aktarımı: Hedef dil/zaman aralığı/normal seçenekler yalnız seçili işlemin payloadunda doğru kalsın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0210 | Yerel referans ses seç [pick_local_voice_reference] | Sonuç ve erişim: Başarı/partial/hata sonrası gerçek çıktı veya yeniden deneme erişilsin; dar EN/TR panelde düğmeler kaybolmasın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0211 | Referans ses hazırla [prepare_voice_reference] | Öneri sınırı: Araç önerisi tek başına işi/ücreti/kalıcı değişikliği başlatmasın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0212 | Referans ses hazırla [prepare_voice_reference] | Gerçek kabul: Kullanıcı uygulayınca mevcut uygulama kapısına tam bir defa bağlan; accepted ile completed ayrımını koru. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0213 | Referans ses hazırla [prepare_voice_reference] | Kaynak değişimi: Onaydan önce kaynak/sekme değişirse eski karta yan etki yaptırma. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0214 | Referans ses hazırla [prepare_voice_reference] | Sohbet/deadline: Bekleyen eylem sohbet değişimi veya süresi dolunca yeni bağlama uygulanmasın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0215 | Referans ses hazırla [prepare_voice_reference] | İptal yarışı: Başlangıç beklerken iptal et; henüz başlamayan alt işi başlatma, başladıysa exact işin sonucunu raporla. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0216 | Referans ses hazırla [prepare_voice_reference] | Kimlik ve değer: Geçersiz kimlik/aralık/enum ile mevcut kullanıcı verisini değiştirme; düzeltilebilir hata göster. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0217 | Referans ses hazırla [prepare_voice_reference] | Çift uygulama: Hızlı iki uygulama/tekrar tıklama ikinci eşzamanlı işi veya aynı kalıcı değişikliği üretmesin. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0218 | Referans ses hazırla [prepare_voice_reference] | Kontrollü ret: Mevcut servis ok:false/exception döndürürse başarı kartına dönüştürme. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0219 | Referans ses hazırla [prepare_voice_reference] | Seçenek aktarımı: Hedef dil/zaman aralığı/normal seçenekler yalnız seçili işlemin payloadunda doğru kalsın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0220 | Referans ses hazırla [prepare_voice_reference] | Sonuç ve erişim: Başarı/partial/hata sonrası gerçek çıktı veya yeniden deneme erişilsin; dar EN/TR panelde düğmeler kaybolmasın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0221 | Dublaj seçeneklerini ayarla [configure_voice_generation] | Öneri sınırı: Araç önerisi tek başına işi/ücreti/kalıcı değişikliği başlatmasın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0222 | Dublaj seçeneklerini ayarla [configure_voice_generation] | Gerçek kabul: Kullanıcı uygulayınca mevcut uygulama kapısına tam bir defa bağlan; accepted ile completed ayrımını koru. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0223 | Dublaj seçeneklerini ayarla [configure_voice_generation] | Kaynak değişimi: Onaydan önce kaynak/sekme değişirse eski karta yan etki yaptırma. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0224 | Dublaj seçeneklerini ayarla [configure_voice_generation] | Sohbet/deadline: Bekleyen eylem sohbet değişimi veya süresi dolunca yeni bağlama uygulanmasın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0225 | Dublaj seçeneklerini ayarla [configure_voice_generation] | İptal yarışı: Başlangıç beklerken iptal et; henüz başlamayan alt işi başlatma, başladıysa exact işin sonucunu raporla. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0226 | Dublaj seçeneklerini ayarla [configure_voice_generation] | Kimlik ve değer: Geçersiz kimlik/aralık/enum ile mevcut kullanıcı verisini değiştirme; düzeltilebilir hata göster. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0227 | Dublaj seçeneklerini ayarla [configure_voice_generation] | Çift uygulama: Hızlı iki uygulama/tekrar tıklama ikinci eşzamanlı işi veya aynı kalıcı değişikliği üretmesin. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0228 | Dublaj seçeneklerini ayarla [configure_voice_generation] | Kontrollü ret: Mevcut servis ok:false/exception döndürürse başarı kartına dönüştürme. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0229 | Dublaj seçeneklerini ayarla [configure_voice_generation] | Seçenek aktarımı: Hedef dil/zaman aralığı/normal seçenekler yalnız seçili işlemin payloadunda doğru kalsın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0230 | Dublaj seçeneklerini ayarla [configure_voice_generation] | Sonuç ve erişim: Başarı/partial/hata sonrası gerçek çıktı veya yeniden deneme erişilsin; dar EN/TR panelde düğmeler kaybolmasın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0231 | Ses üretimini başlat [start_voice_generation] | Öneri sınırı: Araç önerisi tek başına işi/ücreti/kalıcı değişikliği başlatmasın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0232 | Ses üretimini başlat [start_voice_generation] | Gerçek kabul: Kullanıcı uygulayınca mevcut uygulama kapısına tam bir defa bağlan; accepted ile completed ayrımını koru. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0233 | Ses üretimini başlat [start_voice_generation] | Kaynak değişimi: Onaydan önce kaynak/sekme değişirse eski karta yan etki yaptırma. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0234 | Ses üretimini başlat [start_voice_generation] | Sohbet/deadline: Bekleyen eylem sohbet değişimi veya süresi dolunca yeni bağlama uygulanmasın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0235 | Ses üretimini başlat [start_voice_generation] | İptal yarışı: Başlangıç beklerken iptal et; henüz başlamayan alt işi başlatma, başladıysa exact işin sonucunu raporla. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0236 | Ses üretimini başlat [start_voice_generation] | Kimlik ve değer: Geçersiz kimlik/aralık/enum ile mevcut kullanıcı verisini değiştirme; düzeltilebilir hata göster. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0237 | Ses üretimini başlat [start_voice_generation] | Çift uygulama: Hızlı iki uygulama/tekrar tıklama ikinci eşzamanlı işi veya aynı kalıcı değişikliği üretmesin. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0238 | Ses üretimini başlat [start_voice_generation] | Kontrollü ret: Mevcut servis ok:false/exception döndürürse başarı kartına dönüştürme. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0239 | Ses üretimini başlat [start_voice_generation] | Seçenek aktarımı: Hedef dil/zaman aralığı/normal seçenekler yalnız seçili işlemin payloadunda doğru kalsın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0240 | Ses üretimini başlat [start_voice_generation] | Sonuç ve erişim: Başarı/partial/hata sonrası gerçek çıktı veya yeniden deneme erişilsin; dar EN/TR panelde düğmeler kaybolmasın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0241 | Ses grubunu işle [voice_group] | Öneri sınırı: Araç önerisi tek başına işi/ücreti/kalıcı değişikliği başlatmasın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0242 | Ses grubunu işle [voice_group] | Gerçek kabul: Kullanıcı uygulayınca mevcut uygulama kapısına tam bir defa bağlan; accepted ile completed ayrımını koru. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0243 | Ses grubunu işle [voice_group] | Kaynak değişimi: Onaydan önce kaynak/sekme değişirse eski karta yan etki yaptırma. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0244 | Ses grubunu işle [voice_group] | Sohbet/deadline: Bekleyen eylem sohbet değişimi veya süresi dolunca yeni bağlama uygulanmasın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0245 | Ses grubunu işle [voice_group] | İptal yarışı: Başlangıç beklerken iptal et; henüz başlamayan alt işi başlatma, başladıysa exact işin sonucunu raporla. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0246 | Ses grubunu işle [voice_group] | Kimlik ve değer: Geçersiz kimlik/aralık/enum ile mevcut kullanıcı verisini değiştirme; düzeltilebilir hata göster. | `src/assistant-capabilities.js` | DÜZELTİLDİ | 4b425912febc84d5d3807321ee85ae4963a93193: gerçek üretilmiş uzun kimlik open/listen/regenerate şemasında kabul;2001ret. 200→2000 yalnız grupkimliği alanı, genelmetin sınırı değişmez. |
| P0247 | Ses grubunu işle [voice_group] | Çift uygulama: Hızlı iki uygulama/tekrar tıklama ikinci eşzamanlı işi veya aynı kalıcı değişikliği üretmesin. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0248 | Ses grubunu işle [voice_group] | Kontrollü ret: Mevcut servis ok:false/exception döndürürse başarı kartına dönüştürme. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0249 | Ses grubunu işle [voice_group] | Seçenek aktarımı: Hedef dil/zaman aralığı/normal seçenekler yalnız seçili işlemin payloadunda doğru kalsın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0250 | Ses grubunu işle [voice_group] | Sonuç ve erişim: Başarı/partial/hata sonrası gerçek çıktı veya yeniden deneme erişilsin; dar EN/TR panelde düğmeler kaybolmasın. | `src/assistant-capabilities.js` | İLERLEDİ | Native720×680/ENlight: uzun gruplu kontrollü çıktı exactkimlikle okunur; görünür kalite seçicisi ve dinleme düğmesi PNGde incelendi. Gerçek group listen/regenerate akustik sonucu bu pakette yok. |
| P0251 | Üretilen sesi kullan [use_generated_voice] | Öneri sınırı: Araç önerisi tek başına işi/ücreti/kalıcı değişikliği başlatmasın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0252 | Üretilen sesi kullan [use_generated_voice] | Gerçek kabul: Kullanıcı uygulayınca mevcut uygulama kapısına tam bir defa bağlan; accepted ile completed ayrımını koru. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0253 | Üretilen sesi kullan [use_generated_voice] | Kaynak değişimi: Onaydan önce kaynak/sekme değişirse eski karta yan etki yaptırma. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0254 | Üretilen sesi kullan [use_generated_voice] | Sohbet/deadline: Bekleyen eylem sohbet değişimi veya süresi dolunca yeni bağlama uygulanmasın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0255 | Üretilen sesi kullan [use_generated_voice] | İptal yarışı: Başlangıç beklerken iptal et; henüz başlamayan alt işi başlatma, başladıysa exact işin sonucunu raporla. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0256 | Üretilen sesi kullan [use_generated_voice] | Kimlik ve değer: Geçersiz kimlik/aralık/enum ile mevcut kullanıcı verisini değiştirme; düzeltilebilir hata göster. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0257 | Üretilen sesi kullan [use_generated_voice] | Çift uygulama: Hızlı iki uygulama/tekrar tıklama ikinci eşzamanlı işi veya aynı kalıcı değişikliği üretmesin. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0258 | Üretilen sesi kullan [use_generated_voice] | Kontrollü ret: Mevcut servis ok:false/exception döndürürse başarı kartına dönüştürme. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0259 | Üretilen sesi kullan [use_generated_voice] | Seçenek aktarımı: Hedef dil/zaman aralığı/normal seçenekler yalnız seçili işlemin payloadunda doğru kalsın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0260 | Üretilen sesi kullan [use_generated_voice] | Sonuç ve erişim: Başarı/partial/hata sonrası gerçek çıktı veya yeniden deneme erişilsin; dar EN/TR panelde düğmeler kaybolmasın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0261 | Özgün sese dön [restore_original_audio] | Öneri sınırı: Araç önerisi tek başına işi/ücreti/kalıcı değişikliği başlatmasın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0262 | Özgün sese dön [restore_original_audio] | Gerçek kabul: Kullanıcı uygulayınca mevcut uygulama kapısına tam bir defa bağlan; accepted ile completed ayrımını koru. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0263 | Özgün sese dön [restore_original_audio] | Kaynak değişimi: Onaydan önce kaynak/sekme değişirse eski karta yan etki yaptırma. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0264 | Özgün sese dön [restore_original_audio] | Sohbet/deadline: Bekleyen eylem sohbet değişimi veya süresi dolunca yeni bağlama uygulanmasın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0265 | Özgün sese dön [restore_original_audio] | İptal yarışı: Başlangıç beklerken iptal et; henüz başlamayan alt işi başlatma, başladıysa exact işin sonucunu raporla. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0266 | Özgün sese dön [restore_original_audio] | Kimlik ve değer: Geçersiz kimlik/aralık/enum ile mevcut kullanıcı verisini değiştirme; düzeltilebilir hata göster. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0267 | Özgün sese dön [restore_original_audio] | Çift uygulama: Hızlı iki uygulama/tekrar tıklama ikinci eşzamanlı işi veya aynı kalıcı değişikliği üretmesin. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0268 | Özgün sese dön [restore_original_audio] | Kontrollü ret: Mevcut servis ok:false/exception döndürürse başarı kartına dönüştürme. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0269 | Özgün sese dön [restore_original_audio] | Seçenek aktarımı: Hedef dil/zaman aralığı/normal seçenekler yalnız seçili işlemin payloadunda doğru kalsın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0270 | Özgün sese dön [restore_original_audio] | Sonuç ve erişim: Başarı/partial/hata sonrası gerçek çıktı veya yeniden deneme erişilsin; dar EN/TR panelde düğmeler kaybolmasın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0271 | Ses stüdyosunu aç [open_voice_preparation] | Öneri sınırı: Araç önerisi tek başına işi/ücreti/kalıcı değişikliği başlatmasın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0272 | Ses stüdyosunu aç [open_voice_preparation] | Gerçek kabul: Kullanıcı uygulayınca mevcut uygulama kapısına tam bir defa bağlan; accepted ile completed ayrımını koru. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0273 | Ses stüdyosunu aç [open_voice_preparation] | Kaynak değişimi: Onaydan önce kaynak/sekme değişirse eski karta yan etki yaptırma. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0274 | Ses stüdyosunu aç [open_voice_preparation] | Sohbet/deadline: Bekleyen eylem sohbet değişimi veya süresi dolunca yeni bağlama uygulanmasın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0275 | Ses stüdyosunu aç [open_voice_preparation] | İptal yarışı: Başlangıç beklerken iptal et; henüz başlamayan alt işi başlatma, başladıysa exact işin sonucunu raporla. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0276 | Ses stüdyosunu aç [open_voice_preparation] | Kimlik ve değer: Geçersiz kimlik/aralık/enum ile mevcut kullanıcı verisini değiştirme; düzeltilebilir hata göster. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0277 | Ses stüdyosunu aç [open_voice_preparation] | Çift uygulama: Hızlı iki uygulama/tekrar tıklama ikinci eşzamanlı işi veya aynı kalıcı değişikliği üretmesin. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0278 | Ses stüdyosunu aç [open_voice_preparation] | Kontrollü ret: Mevcut servis ok:false/exception döndürürse başarı kartına dönüştürme. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0279 | Ses stüdyosunu aç [open_voice_preparation] | Seçenek aktarımı: Hedef dil/zaman aralığı/normal seçenekler yalnız seçili işlemin payloadunda doğru kalsın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0280 | Ses stüdyosunu aç [open_voice_preparation] | Sonuç ve erişim: Başarı/partial/hata sonrası gerçek çıktı veya yeniden deneme erişilsin; dar EN/TR panelde düğmeler kaybolmasın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0281 | Uygulama sayfasını aç [navigate_workspace] | Öneri sınırı: Araç önerisi tek başına işi/ücreti/kalıcı değişikliği başlatmasın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0282 | Uygulama sayfasını aç [navigate_workspace] | Gerçek kabul: Kullanıcı uygulayınca mevcut uygulama kapısına tam bir defa bağlan; accepted ile completed ayrımını koru. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0283 | Uygulama sayfasını aç [navigate_workspace] | Kaynak değişimi: Onaydan önce kaynak/sekme değişirse eski karta yan etki yaptırma. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0284 | Uygulama sayfasını aç [navigate_workspace] | Sohbet/deadline: Bekleyen eylem sohbet değişimi veya süresi dolunca yeni bağlama uygulanmasın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0285 | Uygulama sayfasını aç [navigate_workspace] | İptal yarışı: Başlangıç beklerken iptal et; henüz başlamayan alt işi başlatma, başladıysa exact işin sonucunu raporla. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0286 | Uygulama sayfasını aç [navigate_workspace] | Kimlik ve değer: Geçersiz kimlik/aralık/enum ile mevcut kullanıcı verisini değiştirme; düzeltilebilir hata göster. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0287 | Uygulama sayfasını aç [navigate_workspace] | Çift uygulama: Hızlı iki uygulama/tekrar tıklama ikinci eşzamanlı işi veya aynı kalıcı değişikliği üretmesin. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0288 | Uygulama sayfasını aç [navigate_workspace] | Kontrollü ret: Mevcut servis ok:false/exception döndürürse başarı kartına dönüştürme. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0289 | Uygulama sayfasını aç [navigate_workspace] | Seçenek aktarımı: Hedef dil/zaman aralığı/normal seçenekler yalnız seçili işlemin payloadunda doğru kalsın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0290 | Uygulama sayfasını aç [navigate_workspace] | Sonuç ve erişim: Başarı/partial/hata sonrası gerçek çıktı veya yeniden deneme erişilsin; dar EN/TR panelde düğmeler kaybolmasın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0291 | Normal ayarları oku [get_app_preferences] | Geçerli bağlam: Mevcut seçili kaynak ve gerçek kimlikle çağır; yalnız bu kaynağın kanıtını döndür. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0292 | Normal ayarları oku [get_app_preferences] | Boş sonuç: Eşleşen veri yokken boş/uygunsuz durumunu açık göster; sonuç uydurma. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0293 | Normal ayarları oku [get_app_preferences] | Kaynak revizyonu: Okuma beklerken kaynak/sekme değiştir; eski veriyi yeni kaynağa yazma. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0294 | Normal ayarları oku [get_app_preferences] | Sohbet değişimi: Bekleyen sonuç başka sohbete taşınmasın; sahiplik kontrolü sonda da yapılsın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0295 | Normal ayarları oku [get_app_preferences] | İptal/süre sınırı: İptal veya deadline aşımından sonra tamamlandı kartı üretme. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0296 | Normal ayarları oku [get_app_preferences] | Sınır ve sayfalama: Uzun sonuç kesiliyorsa kapsam/sayfalama açık olsun; sonraki kimlik erişilebilir kalsın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0297 | Normal ayarları oku [get_app_preferences] | Hata ayrımı: Kontrollü servis hatasını boş başarılı sonuç gibi sunma. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0298 | Normal ayarları oku [get_app_preferences] | Unicode ve satırlar: Türkçe harf, birleşen işaret ve satır sonunu kaynak metninde koru. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0299 | Normal ayarları oku [get_app_preferences] | Yetki ve veri: Ham dosya yolu, anahtar veya farklı kaynak verisini modele döndürme. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0300 | Normal ayarları oku [get_app_preferences] | Tekrar ve odak: Tekrarlanan okuma yan etki başlatmasın; dar panelde odak/mesaj erişilsin. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0301 | Normal ayarları değiştir [set_app_preferences] | Öneri sınırı: Araç önerisi tek başına işi/ücreti/kalıcı değişikliği başlatmasın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0302 | Normal ayarları değiştir [set_app_preferences] | Gerçek kabul: Kullanıcı uygulayınca mevcut uygulama kapısına tam bir defa bağlan; accepted ile completed ayrımını koru. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0303 | Normal ayarları değiştir [set_app_preferences] | Kaynak değişimi: Onaydan önce kaynak/sekme değişirse eski karta yan etki yaptırma. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0304 | Normal ayarları değiştir [set_app_preferences] | Sohbet/deadline: Bekleyen eylem sohbet değişimi veya süresi dolunca yeni bağlama uygulanmasın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0305 | Normal ayarları değiştir [set_app_preferences] | İptal yarışı: Başlangıç beklerken iptal et; henüz başlamayan alt işi başlatma, başladıysa exact işin sonucunu raporla. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0306 | Normal ayarları değiştir [set_app_preferences] | Kimlik ve değer: Geçersiz kimlik/aralık/enum ile mevcut kullanıcı verisini değiştirme; düzeltilebilir hata göster. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0307 | Normal ayarları değiştir [set_app_preferences] | Çift uygulama: Hızlı iki uygulama/tekrar tıklama ikinci eşzamanlı işi veya aynı kalıcı değişikliği üretmesin. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0308 | Normal ayarları değiştir [set_app_preferences] | Kontrollü ret: Mevcut servis ok:false/exception döndürürse başarı kartına dönüştürme. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0309 | Normal ayarları değiştir [set_app_preferences] | Seçenek aktarımı: Hedef dil/zaman aralığı/normal seçenekler yalnız seçili işlemin payloadunda doğru kalsın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0310 | Normal ayarları değiştir [set_app_preferences] | Sonuç ve erişim: Başarı/partial/hata sonrası gerçek çıktı veya yeniden deneme erişilsin; dar EN/TR panelde düğmeler kaybolmasın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0311 | Son ayar değişikliğini geri al [undo_app_preferences] | Öneri sınırı: Araç önerisi tek başına işi/ücreti/kalıcı değişikliği başlatmasın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0312 | Son ayar değişikliğini geri al [undo_app_preferences] | Gerçek kabul: Kullanıcı uygulayınca mevcut uygulama kapısına tam bir defa bağlan; accepted ile completed ayrımını koru. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0313 | Son ayar değişikliğini geri al [undo_app_preferences] | Kaynak değişimi: Onaydan önce kaynak/sekme değişirse eski karta yan etki yaptırma. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0314 | Son ayar değişikliğini geri al [undo_app_preferences] | Sohbet/deadline: Bekleyen eylem sohbet değişimi veya süresi dolunca yeni bağlama uygulanmasın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0315 | Son ayar değişikliğini geri al [undo_app_preferences] | İptal yarışı: Başlangıç beklerken iptal et; henüz başlamayan alt işi başlatma, başladıysa exact işin sonucunu raporla. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0316 | Son ayar değişikliğini geri al [undo_app_preferences] | Kimlik ve değer: Geçersiz kimlik/aralık/enum ile mevcut kullanıcı verisini değiştirme; düzeltilebilir hata göster. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0317 | Son ayar değişikliğini geri al [undo_app_preferences] | Çift uygulama: Hızlı iki uygulama/tekrar tıklama ikinci eşzamanlı işi veya aynı kalıcı değişikliği üretmesin. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0318 | Son ayar değişikliğini geri al [undo_app_preferences] | Kontrollü ret: Mevcut servis ok:false/exception döndürürse başarı kartına dönüştürme. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0319 | Son ayar değişikliğini geri al [undo_app_preferences] | Seçenek aktarımı: Hedef dil/zaman aralığı/normal seçenekler yalnız seçili işlemin payloadunda doğru kalsın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0320 | Son ayar değişikliğini geri al [undo_app_preferences] | Sonuç ve erişim: Başarı/partial/hata sonrası gerçek çıktı veya yeniden deneme erişilsin; dar EN/TR panelde düğmeler kaybolmasın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0321 | Oynatmayı kontrol et [playback_control] | Öneri sınırı: Araç önerisi tek başına işi/ücreti/kalıcı değişikliği başlatmasın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0322 | Oynatmayı kontrol et [playback_control] | Gerçek kabul: Kullanıcı uygulayınca mevcut uygulama kapısına tam bir defa bağlan; accepted ile completed ayrımını koru. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0323 | Oynatmayı kontrol et [playback_control] | Kaynak değişimi: Onaydan önce kaynak/sekme değişirse eski karta yan etki yaptırma. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0324 | Oynatmayı kontrol et [playback_control] | Sohbet/deadline: Bekleyen eylem sohbet değişimi veya süresi dolunca yeni bağlama uygulanmasın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0325 | Oynatmayı kontrol et [playback_control] | İptal yarışı: Başlangıç beklerken iptal et; henüz başlamayan alt işi başlatma, başladıysa exact işin sonucunu raporla. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0326 | Oynatmayı kontrol et [playback_control] | Kimlik ve değer: Geçersiz kimlik/aralık/enum ile mevcut kullanıcı verisini değiştirme; düzeltilebilir hata göster. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0327 | Oynatmayı kontrol et [playback_control] | Çift uygulama: Hızlı iki uygulama/tekrar tıklama ikinci eşzamanlı işi veya aynı kalıcı değişikliği üretmesin. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0328 | Oynatmayı kontrol et [playback_control] | Kontrollü ret: Mevcut servis ok:false/exception döndürürse başarı kartına dönüştürme. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0329 | Oynatmayı kontrol et [playback_control] | Seçenek aktarımı: Hedef dil/zaman aralığı/normal seçenekler yalnız seçili işlemin payloadunda doğru kalsın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0330 | Oynatmayı kontrol et [playback_control] | Sonuç ve erişim: Başarı/partial/hata sonrası gerçek çıktı veya yeniden deneme erişilsin; dar EN/TR panelde düğmeler kaybolmasın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0331 | Ayarları aç [open_settings] | Öneri sınırı: Araç önerisi tek başına işi/ücreti/kalıcı değişikliği başlatmasın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0332 | Ayarları aç [open_settings] | Gerçek kabul: Kullanıcı uygulayınca mevcut uygulama kapısına tam bir defa bağlan; accepted ile completed ayrımını koru. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0333 | Ayarları aç [open_settings] | Kaynak değişimi: Onaydan önce kaynak/sekme değişirse eski karta yan etki yaptırma. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0334 | Ayarları aç [open_settings] | Sohbet/deadline: Bekleyen eylem sohbet değişimi veya süresi dolunca yeni bağlama uygulanmasın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0335 | Ayarları aç [open_settings] | İptal yarışı: Başlangıç beklerken iptal et; henüz başlamayan alt işi başlatma, başladıysa exact işin sonucunu raporla. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0336 | Ayarları aç [open_settings] | Kimlik ve değer: Geçersiz kimlik/aralık/enum ile mevcut kullanıcı verisini değiştirme; düzeltilebilir hata göster. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0337 | Ayarları aç [open_settings] | Çift uygulama: Hızlı iki uygulama/tekrar tıklama ikinci eşzamanlı işi veya aynı kalıcı değişikliği üretmesin. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0338 | Ayarları aç [open_settings] | Kontrollü ret: Mevcut servis ok:false/exception döndürürse başarı kartına dönüştürme. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0339 | Ayarları aç [open_settings] | Seçenek aktarımı: Hedef dil/zaman aralığı/normal seçenekler yalnız seçili işlemin payloadunda doğru kalsın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0340 | Ayarları aç [open_settings] | Sonuç ve erişim: Başarı/partial/hata sonrası gerçek çıktı veya yeniden deneme erişilsin; dar EN/TR panelde düğmeler kaybolmasın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0341 | Kitap bağlamını oku [get_book_context] | Geçerli bağlam: Mevcut seçili kaynak ve gerçek kimlikle çağır; yalnız bu kaynağın kanıtını döndür. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0342 | Kitap bağlamını oku [get_book_context] | Boş sonuç: Eşleşen veri yokken boş/uygunsuz durumunu açık göster; sonuç uydurma. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0343 | Kitap bağlamını oku [get_book_context] | Kaynak revizyonu: Okuma beklerken kaynak/sekme değiştir; eski veriyi yeni kaynağa yazma. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0344 | Kitap bağlamını oku [get_book_context] | Sohbet değişimi: Bekleyen sonuç başka sohbete taşınmasın; sahiplik kontrolü sonda da yapılsın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0345 | Kitap bağlamını oku [get_book_context] | İptal/süre sınırı: İptal veya deadline aşımından sonra tamamlandı kartı üretme. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0346 | Kitap bağlamını oku [get_book_context] | Sınır ve sayfalama: Uzun sonuç kesiliyorsa kapsam/sayfalama açık olsun; sonraki kimlik erişilebilir kalsın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0347 | Kitap bağlamını oku [get_book_context] | Hata ayrımı: Kontrollü servis hatasını boş başarılı sonuç gibi sunma. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0348 | Kitap bağlamını oku [get_book_context] | Unicode ve satırlar: Türkçe harf, birleşen işaret ve satır sonunu kaynak metninde koru. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0349 | Kitap bağlamını oku [get_book_context] | Yetki ve veri: Ham dosya yolu, anahtar veya farklı kaynak verisini modele döndürme. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0350 | Kitap bağlamını oku [get_book_context] | Tekrar ve odak: Tekrarlanan okuma yan etki başlatmasın; dar panelde odak/mesaj erişilsin. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0351 | Kitap seslendirmesini hazırla [prepare_book_narration] | Öneri sınırı: Araç önerisi tek başına işi/ücreti/kalıcı değişikliği başlatmasın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0352 | Kitap seslendirmesini hazırla [prepare_book_narration] | Gerçek kabul: Kullanıcı uygulayınca mevcut uygulama kapısına tam bir defa bağlan; accepted ile completed ayrımını koru. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0353 | Kitap seslendirmesini hazırla [prepare_book_narration] | Kaynak değişimi: Onaydan önce kaynak/sekme değişirse eski karta yan etki yaptırma. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0354 | Kitap seslendirmesini hazırla [prepare_book_narration] | Sohbet/deadline: Bekleyen eylem sohbet değişimi veya süresi dolunca yeni bağlama uygulanmasın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0355 | Kitap seslendirmesini hazırla [prepare_book_narration] | İptal yarışı: Başlangıç beklerken iptal et; henüz başlamayan alt işi başlatma, başladıysa exact işin sonucunu raporla. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0356 | Kitap seslendirmesini hazırla [prepare_book_narration] | Kimlik ve değer: Geçersiz kimlik/aralık/enum ile mevcut kullanıcı verisini değiştirme; düzeltilebilir hata göster. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0357 | Kitap seslendirmesini hazırla [prepare_book_narration] | Çift uygulama: Hızlı iki uygulama/tekrar tıklama ikinci eşzamanlı işi veya aynı kalıcı değişikliği üretmesin. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0358 | Kitap seslendirmesini hazırla [prepare_book_narration] | Kontrollü ret: Mevcut servis ok:false/exception döndürürse başarı kartına dönüştürme. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0359 | Kitap seslendirmesini hazırla [prepare_book_narration] | Seçenek aktarımı: Hedef dil/zaman aralığı/normal seçenekler yalnız seçili işlemin payloadunda doğru kalsın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0360 | Kitap seslendirmesini hazırla [prepare_book_narration] | Sonuç ve erişim: Başarı/partial/hata sonrası gerçek çıktı veya yeniden deneme erişilsin; dar EN/TR panelde düğmeler kaybolmasın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0361 | Üretim bölümlerini seç [select_book_chapters] | Öneri sınırı: Araç önerisi tek başına işi/ücreti/kalıcı değişikliği başlatmasın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0362 | Üretim bölümlerini seç [select_book_chapters] | Gerçek kabul: Kullanıcı uygulayınca mevcut uygulama kapısına tam bir defa bağlan; accepted ile completed ayrımını koru. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0363 | Üretim bölümlerini seç [select_book_chapters] | Kaynak değişimi: Onaydan önce kaynak/sekme değişirse eski karta yan etki yaptırma. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0364 | Üretim bölümlerini seç [select_book_chapters] | Sohbet/deadline: Bekleyen eylem sohbet değişimi veya süresi dolunca yeni bağlama uygulanmasın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0365 | Üretim bölümlerini seç [select_book_chapters] | İptal yarışı: Başlangıç beklerken iptal et; henüz başlamayan alt işi başlatma, başladıysa exact işin sonucunu raporla. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0366 | Üretim bölümlerini seç [select_book_chapters] | Kimlik ve değer: Geçersiz kimlik/aralık/enum ile mevcut kullanıcı verisini değiştirme; düzeltilebilir hata göster. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0367 | Üretim bölümlerini seç [select_book_chapters] | Çift uygulama: Hızlı iki uygulama/tekrar tıklama ikinci eşzamanlı işi veya aynı kalıcı değişikliği üretmesin. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0368 | Üretim bölümlerini seç [select_book_chapters] | Kontrollü ret: Mevcut servis ok:false/exception döndürürse başarı kartına dönüştürme. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0369 | Üretim bölümlerini seç [select_book_chapters] | Seçenek aktarımı: Hedef dil/zaman aralığı/normal seçenekler yalnız seçili işlemin payloadunda doğru kalsın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0370 | Üretim bölümlerini seç [select_book_chapters] | Sonuç ve erişim: Başarı/partial/hata sonrası gerçek çıktı veya yeniden deneme erişilsin; dar EN/TR panelde düğmeler kaybolmasın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0371 | Kitap seslendirmesini başlat [start_book_narration] | Öneri sınırı: Araç önerisi tek başına işi/ücreti/kalıcı değişikliği başlatmasın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0372 | Kitap seslendirmesini başlat [start_book_narration] | Gerçek kabul: Kullanıcı uygulayınca mevcut uygulama kapısına tam bir defa bağlan; accepted ile completed ayrımını koru. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0373 | Kitap seslendirmesini başlat [start_book_narration] | Kaynak değişimi: Onaydan önce kaynak/sekme değişirse eski karta yan etki yaptırma. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0374 | Kitap seslendirmesini başlat [start_book_narration] | Sohbet/deadline: Bekleyen eylem sohbet değişimi veya süresi dolunca yeni bağlama uygulanmasın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0375 | Kitap seslendirmesini başlat [start_book_narration] | İptal yarışı: Başlangıç beklerken iptal et; henüz başlamayan alt işi başlatma, başladıysa exact işin sonucunu raporla. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0376 | Kitap seslendirmesini başlat [start_book_narration] | Kimlik ve değer: Geçersiz kimlik/aralık/enum ile mevcut kullanıcı verisini değiştirme; düzeltilebilir hata göster. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0377 | Kitap seslendirmesini başlat [start_book_narration] | Çift uygulama: Hızlı iki uygulama/tekrar tıklama ikinci eşzamanlı işi veya aynı kalıcı değişikliği üretmesin. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0378 | Kitap seslendirmesini başlat [start_book_narration] | Kontrollü ret: Mevcut servis ok:false/exception döndürürse başarı kartına dönüştürme. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0379 | Kitap seslendirmesini başlat [start_book_narration] | Seçenek aktarımı: Hedef dil/zaman aralığı/normal seçenekler yalnız seçili işlemin payloadunda doğru kalsın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0380 | Kitap seslendirmesini başlat [start_book_narration] | Sonuç ve erişim: Başarı/partial/hata sonrası gerçek çıktı veya yeniden deneme erişilsin; dar EN/TR panelde düğmeler kaybolmasın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0381 | Kitap bölümünü işle [book_chapter] | Öneri sınırı: Araç önerisi tek başına işi/ücreti/kalıcı değişikliği başlatmasın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0382 | Kitap bölümünü işle [book_chapter] | Gerçek kabul: Kullanıcı uygulayınca mevcut uygulama kapısına tam bir defa bağlan; accepted ile completed ayrımını koru. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0383 | Kitap bölümünü işle [book_chapter] | Kaynak değişimi: Onaydan önce kaynak/sekme değişirse eski karta yan etki yaptırma. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0384 | Kitap bölümünü işle [book_chapter] | Sohbet/deadline: Bekleyen eylem sohbet değişimi veya süresi dolunca yeni bağlama uygulanmasın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0385 | Kitap bölümünü işle [book_chapter] | İptal yarışı: Başlangıç beklerken iptal et; henüz başlamayan alt işi başlatma, başladıysa exact işin sonucunu raporla. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0386 | Kitap bölümünü işle [book_chapter] | Kimlik ve değer: Geçersiz kimlik/aralık/enum ile mevcut kullanıcı verisini değiştirme; düzeltilebilir hata göster. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0387 | Kitap bölümünü işle [book_chapter] | Çift uygulama: Hızlı iki uygulama/tekrar tıklama ikinci eşzamanlı işi veya aynı kalıcı değişikliği üretmesin. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0388 | Kitap bölümünü işle [book_chapter] | Kontrollü ret: Mevcut servis ok:false/exception döndürürse başarı kartına dönüştürme. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0389 | Kitap bölümünü işle [book_chapter] | Seçenek aktarımı: Hedef dil/zaman aralığı/normal seçenekler yalnız seçili işlemin payloadunda doğru kalsın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0390 | Kitap bölümünü işle [book_chapter] | Sonuç ve erişim: Başarı/partial/hata sonrası gerçek çıktı veya yeniden deneme erişilsin; dar EN/TR panelde düğmeler kaybolmasın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0391 | M4B hazırlığını denetle [preview_book_export] | Geçerli bağlam: Mevcut seçili kaynak ve gerçek kimlikle çağır; yalnız bu kaynağın kanıtını döndür. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0392 | M4B hazırlığını denetle [preview_book_export] | Boş sonuç: Eşleşen veri yokken boş/uygunsuz durumunu açık göster; sonuç uydurma. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0393 | M4B hazırlığını denetle [preview_book_export] | Kaynak revizyonu: Okuma beklerken kaynak/sekme değiştir; eski veriyi yeni kaynağa yazma. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0394 | M4B hazırlığını denetle [preview_book_export] | Sohbet değişimi: Bekleyen sonuç başka sohbete taşınmasın; sahiplik kontrolü sonda da yapılsın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0395 | M4B hazırlığını denetle [preview_book_export] | İptal/süre sınırı: İptal veya deadline aşımından sonra tamamlandı kartı üretme. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0396 | M4B hazırlığını denetle [preview_book_export] | Sınır ve sayfalama: Uzun sonuç kesiliyorsa kapsam/sayfalama açık olsun; sonraki kimlik erişilebilir kalsın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0397 | M4B hazırlığını denetle [preview_book_export] | Hata ayrımı: Kontrollü servis hatasını boş başarılı sonuç gibi sunma. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0398 | M4B hazırlığını denetle [preview_book_export] | Unicode ve satırlar: Türkçe harf, birleşen işaret ve satır sonunu kaynak metninde koru. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0399 | M4B hazırlığını denetle [preview_book_export] | Yetki ve veri: Ham dosya yolu, anahtar veya farklı kaynak verisini modele döndürme. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0400 | M4B hazırlığını denetle [preview_book_export] | Tekrar ve odak: Tekrarlanan okuma yan etki başlatmasın; dar panelde odak/mesaj erişilsin. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0401 | Kitabı M4B olarak kaydet [export_book_audio] | Öneri sınırı: Araç önerisi tek başına işi/ücreti/kalıcı değişikliği başlatmasın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0402 | Kitabı M4B olarak kaydet [export_book_audio] | Gerçek kabul: Kullanıcı uygulayınca mevcut uygulama kapısına tam bir defa bağlan; accepted ile completed ayrımını koru. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0403 | Kitabı M4B olarak kaydet [export_book_audio] | Kaynak değişimi: Onaydan önce kaynak/sekme değişirse eski karta yan etki yaptırma. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0404 | Kitabı M4B olarak kaydet [export_book_audio] | Sohbet/deadline: Bekleyen eylem sohbet değişimi veya süresi dolunca yeni bağlama uygulanmasın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0405 | Kitabı M4B olarak kaydet [export_book_audio] | İptal yarışı: Başlangıç beklerken iptal et; henüz başlamayan alt işi başlatma, başladıysa exact işin sonucunu raporla. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0406 | Kitabı M4B olarak kaydet [export_book_audio] | Kimlik ve değer: Geçersiz kimlik/aralık/enum ile mevcut kullanıcı verisini değiştirme; düzeltilebilir hata göster. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0407 | Kitabı M4B olarak kaydet [export_book_audio] | Çift uygulama: Hızlı iki uygulama/tekrar tıklama ikinci eşzamanlı işi veya aynı kalıcı değişikliği üretmesin. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0408 | Kitabı M4B olarak kaydet [export_book_audio] | Kontrollü ret: Mevcut servis ok:false/exception döndürürse başarı kartına dönüştürme. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0409 | Kitabı M4B olarak kaydet [export_book_audio] | Seçenek aktarımı: Hedef dil/zaman aralığı/normal seçenekler yalnız seçili işlemin payloadunda doğru kalsın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0410 | Kitabı M4B olarak kaydet [export_book_audio] | Sonuç ve erişim: Başarı/partial/hata sonrası gerçek çıktı veya yeniden deneme erişilsin; dar EN/TR panelde düğmeler kaybolmasın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0411 | Kütüphanede ara [search_library] | Geçerli bağlam: Mevcut seçili kaynak ve gerçek kimlikle çağır; yalnız bu kaynağın kanıtını döndür. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0412 | Kütüphanede ara [search_library] | Boş sonuç: Eşleşen veri yokken boş/uygunsuz durumunu açık göster; sonuç uydurma. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0413 | Kütüphanede ara [search_library] | Kaynak revizyonu: Okuma beklerken kaynak/sekme değiştir; eski veriyi yeni kaynağa yazma. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0414 | Kütüphanede ara [search_library] | Sohbet değişimi: Bekleyen sonuç başka sohbete taşınmasın; sahiplik kontrolü sonda da yapılsın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0415 | Kütüphanede ara [search_library] | İptal/süre sınırı: İptal veya deadline aşımından sonra tamamlandı kartı üretme. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0416 | Kütüphanede ara [search_library] | Sınır ve sayfalama: Uzun sonuç kesiliyorsa kapsam/sayfalama açık olsun; sonraki kimlik erişilebilir kalsın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0417 | Kütüphanede ara [search_library] | Hata ayrımı: Kontrollü servis hatasını boş başarılı sonuç gibi sunma. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0418 | Kütüphanede ara [search_library] | Unicode ve satırlar: Türkçe harf, birleşen işaret ve satır sonunu kaynak metninde koru. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0419 | Kütüphanede ara [search_library] | Yetki ve veri: Ham dosya yolu, anahtar veya farklı kaynak verisini modele döndürme. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0420 | Kütüphanede ara [search_library] | Tekrar ve odak: Tekrarlanan okuma yan etki başlatmasın; dar panelde odak/mesaj erişilsin. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0421 | Keşfette ara [discover_titles] | Geçerli bağlam: Mevcut seçili kaynak ve gerçek kimlikle çağır; yalnız bu kaynağın kanıtını döndür. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0422 | Keşfette ara [discover_titles] | Boş sonuç: Eşleşen veri yokken boş/uygunsuz durumunu açık göster; sonuç uydurma. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0423 | Keşfette ara [discover_titles] | Kaynak revizyonu: Okuma beklerken kaynak/sekme değiştir; eski veriyi yeni kaynağa yazma. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0424 | Keşfette ara [discover_titles] | Sohbet değişimi: Bekleyen sonuç başka sohbete taşınmasın; sahiplik kontrolü sonda da yapılsın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0425 | Keşfette ara [discover_titles] | İptal/süre sınırı: İptal veya deadline aşımından sonra tamamlandı kartı üretme. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0426 | Keşfette ara [discover_titles] | Sınır ve sayfalama: Uzun sonuç kesiliyorsa kapsam/sayfalama açık olsun; sonraki kimlik erişilebilir kalsın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0427 | Keşfette ara [discover_titles] | Hata ayrımı: Kontrollü servis hatasını boş başarılı sonuç gibi sunma. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0428 | Keşfette ara [discover_titles] | Unicode ve satırlar: Türkçe harf, birleşen işaret ve satır sonunu kaynak metninde koru. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0429 | Keşfette ara [discover_titles] | Yetki ve veri: Ham dosya yolu, anahtar veya farklı kaynak verisini modele döndürme. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0430 | Keşfette ara [discover_titles] | Tekrar ve odak: Tekrarlanan okuma yan etki başlatmasın; dar panelde odak/mesaj erişilsin. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0431 | Yapım bilgilerini oku [get_title_details] | Geçerli bağlam: Mevcut seçili kaynak ve gerçek kimlikle çağır; yalnız bu kaynağın kanıtını döndür. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0432 | Yapım bilgilerini oku [get_title_details] | Boş sonuç: Eşleşen veri yokken boş/uygunsuz durumunu açık göster; sonuç uydurma. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0433 | Yapım bilgilerini oku [get_title_details] | Kaynak revizyonu: Okuma beklerken kaynak/sekme değiştir; eski veriyi yeni kaynağa yazma. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0434 | Yapım bilgilerini oku [get_title_details] | Sohbet değişimi: Bekleyen sonuç başka sohbete taşınmasın; sahiplik kontrolü sonda da yapılsın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0435 | Yapım bilgilerini oku [get_title_details] | İptal/süre sınırı: İptal veya deadline aşımından sonra tamamlandı kartı üretme. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0436 | Yapım bilgilerini oku [get_title_details] | Sınır ve sayfalama: Uzun sonuç kesiliyorsa kapsam/sayfalama açık olsun; sonraki kimlik erişilebilir kalsın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0437 | Yapım bilgilerini oku [get_title_details] | Hata ayrımı: Kontrollü servis hatasını boş başarılı sonuç gibi sunma. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0438 | Yapım bilgilerini oku [get_title_details] | Unicode ve satırlar: Türkçe harf, birleşen işaret ve satır sonunu kaynak metninde koru. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0439 | Yapım bilgilerini oku [get_title_details] | Yetki ve veri: Ham dosya yolu, anahtar veya farklı kaynak verisini modele döndürme. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0440 | Yapım bilgilerini oku [get_title_details] | Tekrar ve odak: Tekrarlanan okuma yan etki başlatmasın; dar panelde odak/mesaj erişilsin. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0441 | Yapım sayfasını aç [open_library_title] | Öneri sınırı: Araç önerisi tek başına işi/ücreti/kalıcı değişikliği başlatmasın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0442 | Yapım sayfasını aç [open_library_title] | Gerçek kabul: Kullanıcı uygulayınca mevcut uygulama kapısına tam bir defa bağlan; accepted ile completed ayrımını koru. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0443 | Yapım sayfasını aç [open_library_title] | Kaynak değişimi: Onaydan önce kaynak/sekme değişirse eski karta yan etki yaptırma. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0444 | Yapım sayfasını aç [open_library_title] | Sohbet/deadline: Bekleyen eylem sohbet değişimi veya süresi dolunca yeni bağlama uygulanmasın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0445 | Yapım sayfasını aç [open_library_title] | İptal yarışı: Başlangıç beklerken iptal et; henüz başlamayan alt işi başlatma, başladıysa exact işin sonucunu raporla. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0446 | Yapım sayfasını aç [open_library_title] | Kimlik ve değer: Geçersiz kimlik/aralık/enum ile mevcut kullanıcı verisini değiştirme; düzeltilebilir hata göster. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0447 | Yapım sayfasını aç [open_library_title] | Çift uygulama: Hızlı iki uygulama/tekrar tıklama ikinci eşzamanlı işi veya aynı kalıcı değişikliği üretmesin. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0448 | Yapım sayfasını aç [open_library_title] | Kontrollü ret: Mevcut servis ok:false/exception döndürürse başarı kartına dönüştürme. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0449 | Yapım sayfasını aç [open_library_title] | Seçenek aktarımı: Hedef dil/zaman aralığı/normal seçenekler yalnız seçili işlemin payloadunda doğru kalsın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0450 | Yapım sayfasını aç [open_library_title] | Sonuç ve erişim: Başarı/partial/hata sonrası gerçek çıktı veya yeniden deneme erişilsin; dar EN/TR panelde düğmeler kaybolmasın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0451 | İzleneceklere ekle [add_discovery_title] | Öneri sınırı: Araç önerisi tek başına işi/ücreti/kalıcı değişikliği başlatmasın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0452 | İzleneceklere ekle [add_discovery_title] | Gerçek kabul: Kullanıcı uygulayınca mevcut uygulama kapısına tam bir defa bağlan; accepted ile completed ayrımını koru. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0453 | İzleneceklere ekle [add_discovery_title] | Kaynak değişimi: Onaydan önce kaynak/sekme değişirse eski karta yan etki yaptırma. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0454 | İzleneceklere ekle [add_discovery_title] | Sohbet/deadline: Bekleyen eylem sohbet değişimi veya süresi dolunca yeni bağlama uygulanmasın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0455 | İzleneceklere ekle [add_discovery_title] | İptal yarışı: Başlangıç beklerken iptal et; henüz başlamayan alt işi başlatma, başladıysa exact işin sonucunu raporla. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0456 | İzleneceklere ekle [add_discovery_title] | Kimlik ve değer: Geçersiz kimlik/aralık/enum ile mevcut kullanıcı verisini değiştirme; düzeltilebilir hata göster. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0457 | İzleneceklere ekle [add_discovery_title] | Çift uygulama: Hızlı iki uygulama/tekrar tıklama ikinci eşzamanlı işi veya aynı kalıcı değişikliği üretmesin. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0458 | İzleneceklere ekle [add_discovery_title] | Kontrollü ret: Mevcut servis ok:false/exception döndürürse başarı kartına dönüştürme. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0459 | İzleneceklere ekle [add_discovery_title] | Seçenek aktarımı: Hedef dil/zaman aralığı/normal seçenekler yalnız seçili işlemin payloadunda doğru kalsın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0460 | İzleneceklere ekle [add_discovery_title] | Sonuç ve erişim: Başarı/partial/hata sonrası gerçek çıktı veya yeniden deneme erişilsin; dar EN/TR panelde düğmeler kaybolmasın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0461 | Konuyu Türkçeye çevir [translate_title_synopsis] | Öneri sınırı: Araç önerisi tek başına işi/ücreti/kalıcı değişikliği başlatmasın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0462 | Konuyu Türkçeye çevir [translate_title_synopsis] | Gerçek kabul: Kullanıcı uygulayınca mevcut uygulama kapısına tam bir defa bağlan; accepted ile completed ayrımını koru. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0463 | Konuyu Türkçeye çevir [translate_title_synopsis] | Kaynak değişimi: Onaydan önce kaynak/sekme değişirse eski karta yan etki yaptırma. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0464 | Konuyu Türkçeye çevir [translate_title_synopsis] | Sohbet/deadline: Bekleyen eylem sohbet değişimi veya süresi dolunca yeni bağlama uygulanmasın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0465 | Konuyu Türkçeye çevir [translate_title_synopsis] | İptal yarışı: Başlangıç beklerken iptal et; henüz başlamayan alt işi başlatma, başladıysa exact işin sonucunu raporla. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0466 | Konuyu Türkçeye çevir [translate_title_synopsis] | Kimlik ve değer: Geçersiz kimlik/aralık/enum ile mevcut kullanıcı verisini değiştirme; düzeltilebilir hata göster. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0467 | Konuyu Türkçeye çevir [translate_title_synopsis] | Çift uygulama: Hızlı iki uygulama/tekrar tıklama ikinci eşzamanlı işi veya aynı kalıcı değişikliği üretmesin. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0468 | Konuyu Türkçeye çevir [translate_title_synopsis] | Kontrollü ret: Mevcut servis ok:false/exception döndürürse başarı kartına dönüştürme. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0469 | Konuyu Türkçeye çevir [translate_title_synopsis] | Seçenek aktarımı: Hedef dil/zaman aralığı/normal seçenekler yalnız seçili işlemin payloadunda doğru kalsın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0470 | Konuyu Türkçeye çevir [translate_title_synopsis] | Sonuç ve erişim: Başarı/partial/hata sonrası gerçek çıktı veya yeniden deneme erişilsin; dar EN/TR panelde düğmeler kaybolmasın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0471 | Zevk profilini oku [get_taste_profile] | Geçerli bağlam: Mevcut seçili kaynak ve gerçek kimlikle çağır; yalnız bu kaynağın kanıtını döndür. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0472 | Zevk profilini oku [get_taste_profile] | Boş sonuç: Eşleşen veri yokken boş/uygunsuz durumunu açık göster; sonuç uydurma. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0473 | Zevk profilini oku [get_taste_profile] | Kaynak revizyonu: Okuma beklerken kaynak/sekme değiştir; eski veriyi yeni kaynağa yazma. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0474 | Zevk profilini oku [get_taste_profile] | Sohbet değişimi: Bekleyen sonuç başka sohbete taşınmasın; sahiplik kontrolü sonda da yapılsın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0475 | Zevk profilini oku [get_taste_profile] | İptal/süre sınırı: İptal veya deadline aşımından sonra tamamlandı kartı üretme. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0476 | Zevk profilini oku [get_taste_profile] | Sınır ve sayfalama: Uzun sonuç kesiliyorsa kapsam/sayfalama açık olsun; sonraki kimlik erişilebilir kalsın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0477 | Zevk profilini oku [get_taste_profile] | Hata ayrımı: Kontrollü servis hatasını boş başarılı sonuç gibi sunma. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0478 | Zevk profilini oku [get_taste_profile] | Unicode ve satırlar: Türkçe harf, birleşen işaret ve satır sonunu kaynak metninde koru. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0479 | Zevk profilini oku [get_taste_profile] | Yetki ve veri: Ham dosya yolu, anahtar veya farklı kaynak verisini modele döndürme. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0480 | Zevk profilini oku [get_taste_profile] | Tekrar ve odak: Tekrarlanan okuma yan etki başlatmasın; dar panelde odak/mesaj erişilsin. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0481 | Koleksiyon planla [plan_library_collection] | Geçerli bağlam: Mevcut seçili kaynak ve gerçek kimlikle çağır; yalnız bu kaynağın kanıtını döndür. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0482 | Koleksiyon planla [plan_library_collection] | Boş sonuç: Eşleşen veri yokken boş/uygunsuz durumunu açık göster; sonuç uydurma. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0483 | Koleksiyon planla [plan_library_collection] | Kaynak revizyonu: Okuma beklerken kaynak/sekme değiştir; eski veriyi yeni kaynağa yazma. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0484 | Koleksiyon planla [plan_library_collection] | Sohbet değişimi: Bekleyen sonuç başka sohbete taşınmasın; sahiplik kontrolü sonda da yapılsın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0485 | Koleksiyon planla [plan_library_collection] | İptal/süre sınırı: İptal veya deadline aşımından sonra tamamlandı kartı üretme. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0486 | Koleksiyon planla [plan_library_collection] | Sınır ve sayfalama: Uzun sonuç kesiliyorsa kapsam/sayfalama açık olsun; sonraki kimlik erişilebilir kalsın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0487 | Koleksiyon planla [plan_library_collection] | Hata ayrımı: Kontrollü servis hatasını boş başarılı sonuç gibi sunma. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0488 | Koleksiyon planla [plan_library_collection] | Unicode ve satırlar: Türkçe harf, birleşen işaret ve satır sonunu kaynak metninde koru. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0489 | Koleksiyon planla [plan_library_collection] | Yetki ve veri: Ham dosya yolu, anahtar veya farklı kaynak verisini modele döndürme. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0490 | Koleksiyon planla [plan_library_collection] | Tekrar ve odak: Tekrarlanan okuma yan etki başlatmasın; dar panelde odak/mesaj erişilsin. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0491 | Koleksiyon planını oku [get_collection_plan] | Geçerli bağlam: Mevcut seçili kaynak ve gerçek kimlikle çağır; yalnız bu kaynağın kanıtını döndür. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0492 | Koleksiyon planını oku [get_collection_plan] | Boş sonuç: Eşleşen veri yokken boş/uygunsuz durumunu açık göster; sonuç uydurma. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0493 | Koleksiyon planını oku [get_collection_plan] | Kaynak revizyonu: Okuma beklerken kaynak/sekme değiştir; eski veriyi yeni kaynağa yazma. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0494 | Koleksiyon planını oku [get_collection_plan] | Sohbet değişimi: Bekleyen sonuç başka sohbete taşınmasın; sahiplik kontrolü sonda da yapılsın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0495 | Koleksiyon planını oku [get_collection_plan] | İptal/süre sınırı: İptal veya deadline aşımından sonra tamamlandı kartı üretme. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0496 | Koleksiyon planını oku [get_collection_plan] | Sınır ve sayfalama: Uzun sonuç kesiliyorsa kapsam/sayfalama açık olsun; sonraki kimlik erişilebilir kalsın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0497 | Koleksiyon planını oku [get_collection_plan] | Hata ayrımı: Kontrollü servis hatasını boş başarılı sonuç gibi sunma. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0498 | Koleksiyon planını oku [get_collection_plan] | Unicode ve satırlar: Türkçe harf, birleşen işaret ve satır sonunu kaynak metninde koru. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0499 | Koleksiyon planını oku [get_collection_plan] | Yetki ve veri: Ham dosya yolu, anahtar veya farklı kaynak verisini modele döndürme. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0500 | Koleksiyon planını oku [get_collection_plan] | Tekrar ve odak: Tekrarlanan okuma yan etki başlatmasın; dar panelde odak/mesaj erişilsin. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0501 | Koleksiyon planını uygula [apply_library_collection] | Öneri sınırı: Araç önerisi tek başına işi/ücreti/kalıcı değişikliği başlatmasın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0502 | Koleksiyon planını uygula [apply_library_collection] | Gerçek kabul: Kullanıcı uygulayınca mevcut uygulama kapısına tam bir defa bağlan; accepted ile completed ayrımını koru. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0503 | Koleksiyon planını uygula [apply_library_collection] | Kaynak değişimi: Onaydan önce kaynak/sekme değişirse eski karta yan etki yaptırma. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0504 | Koleksiyon planını uygula [apply_library_collection] | Sohbet/deadline: Bekleyen eylem sohbet değişimi veya süresi dolunca yeni bağlama uygulanmasın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0505 | Koleksiyon planını uygula [apply_library_collection] | İptal yarışı: Başlangıç beklerken iptal et; henüz başlamayan alt işi başlatma, başladıysa exact işin sonucunu raporla. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0506 | Koleksiyon planını uygula [apply_library_collection] | Kimlik ve değer: Geçersiz kimlik/aralık/enum ile mevcut kullanıcı verisini değiştirme; düzeltilebilir hata göster. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0507 | Koleksiyon planını uygula [apply_library_collection] | Çift uygulama: Hızlı iki uygulama/tekrar tıklama ikinci eşzamanlı işi veya aynı kalıcı değişikliği üretmesin. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0508 | Koleksiyon planını uygula [apply_library_collection] | Kontrollü ret: Mevcut servis ok:false/exception döndürürse başarı kartına dönüştürme. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0509 | Koleksiyon planını uygula [apply_library_collection] | Seçenek aktarımı: Hedef dil/zaman aralığı/normal seçenekler yalnız seçili işlemin payloadunda doğru kalsın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0510 | Koleksiyon planını uygula [apply_library_collection] | Sonuç ve erişim: Başarı/partial/hata sonrası gerçek çıktı veya yeniden deneme erişilsin; dar EN/TR panelde düğmeler kaybolmasın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0511 | Yapım yorumlarını yükle [load_title_reviews] | Öneri sınırı: Araç önerisi tek başına işi/ücreti/kalıcı değişikliği başlatmasın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0512 | Yapım yorumlarını yükle [load_title_reviews] | Gerçek kabul: Kullanıcı uygulayınca mevcut uygulama kapısına tam bir defa bağlan; accepted ile completed ayrımını koru. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0513 | Yapım yorumlarını yükle [load_title_reviews] | Kaynak değişimi: Onaydan önce kaynak/sekme değişirse eski karta yan etki yaptırma. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0514 | Yapım yorumlarını yükle [load_title_reviews] | Sohbet/deadline: Bekleyen eylem sohbet değişimi veya süresi dolunca yeni bağlama uygulanmasın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0515 | Yapım yorumlarını yükle [load_title_reviews] | İptal yarışı: Başlangıç beklerken iptal et; henüz başlamayan alt işi başlatma, başladıysa exact işin sonucunu raporla. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0516 | Yapım yorumlarını yükle [load_title_reviews] | Kimlik ve değer: Geçersiz kimlik/aralık/enum ile mevcut kullanıcı verisini değiştirme; düzeltilebilir hata göster. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0517 | Yapım yorumlarını yükle [load_title_reviews] | Çift uygulama: Hızlı iki uygulama/tekrar tıklama ikinci eşzamanlı işi veya aynı kalıcı değişikliği üretmesin. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0518 | Yapım yorumlarını yükle [load_title_reviews] | Kontrollü ret: Mevcut servis ok:false/exception döndürürse başarı kartına dönüştürme. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0519 | Yapım yorumlarını yükle [load_title_reviews] | Seçenek aktarımı: Hedef dil/zaman aralığı/normal seçenekler yalnız seçili işlemin payloadunda doğru kalsın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0520 | Yapım yorumlarını yükle [load_title_reviews] | Sonuç ve erişim: Başarı/partial/hata sonrası gerçek çıktı veya yeniden deneme erişilsin; dar EN/TR panelde düğmeler kaybolmasın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0521 | Yorum analizini önizle [preview_title_review_analysis] | Öneri sınırı: Araç önerisi tek başına işi/ücreti/kalıcı değişikliği başlatmasın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0522 | Yorum analizini önizle [preview_title_review_analysis] | Gerçek kabul: Kullanıcı uygulayınca mevcut uygulama kapısına tam bir defa bağlan; accepted ile completed ayrımını koru. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0523 | Yorum analizini önizle [preview_title_review_analysis] | Kaynak değişimi: Onaydan önce kaynak/sekme değişirse eski karta yan etki yaptırma. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0524 | Yorum analizini önizle [preview_title_review_analysis] | Sohbet/deadline: Bekleyen eylem sohbet değişimi veya süresi dolunca yeni bağlama uygulanmasın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0525 | Yorum analizini önizle [preview_title_review_analysis] | İptal yarışı: Başlangıç beklerken iptal et; henüz başlamayan alt işi başlatma, başladıysa exact işin sonucunu raporla. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0526 | Yorum analizini önizle [preview_title_review_analysis] | Kimlik ve değer: Geçersiz kimlik/aralık/enum ile mevcut kullanıcı verisini değiştirme; düzeltilebilir hata göster. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0527 | Yorum analizini önizle [preview_title_review_analysis] | Çift uygulama: Hızlı iki uygulama/tekrar tıklama ikinci eşzamanlı işi veya aynı kalıcı değişikliği üretmesin. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0528 | Yorum analizini önizle [preview_title_review_analysis] | Kontrollü ret: Mevcut servis ok:false/exception döndürürse başarı kartına dönüştürme. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0529 | Yorum analizini önizle [preview_title_review_analysis] | Seçenek aktarımı: Hedef dil/zaman aralığı/normal seçenekler yalnız seçili işlemin payloadunda doğru kalsın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0530 | Yorum analizini önizle [preview_title_review_analysis] | Sonuç ve erişim: Başarı/partial/hata sonrası gerçek çıktı veya yeniden deneme erişilsin; dar EN/TR panelde düğmeler kaybolmasın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0531 | Yorum analizini aç [open_review_analysis] | Öneri sınırı: Araç önerisi tek başına işi/ücreti/kalıcı değişikliği başlatmasın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0532 | Yorum analizini aç [open_review_analysis] | Gerçek kabul: Kullanıcı uygulayınca mevcut uygulama kapısına tam bir defa bağlan; accepted ile completed ayrımını koru. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0533 | Yorum analizini aç [open_review_analysis] | Kaynak değişimi: Onaydan önce kaynak/sekme değişirse eski karta yan etki yaptırma. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0534 | Yorum analizini aç [open_review_analysis] | Sohbet/deadline: Bekleyen eylem sohbet değişimi veya süresi dolunca yeni bağlama uygulanmasın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0535 | Yorum analizini aç [open_review_analysis] | İptal yarışı: Başlangıç beklerken iptal et; henüz başlamayan alt işi başlatma, başladıysa exact işin sonucunu raporla. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0536 | Yorum analizini aç [open_review_analysis] | Kimlik ve değer: Geçersiz kimlik/aralık/enum ile mevcut kullanıcı verisini değiştirme; düzeltilebilir hata göster. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0537 | Yorum analizini aç [open_review_analysis] | Çift uygulama: Hızlı iki uygulama/tekrar tıklama ikinci eşzamanlı işi veya aynı kalıcı değişikliği üretmesin. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0538 | Yorum analizini aç [open_review_analysis] | Kontrollü ret: Mevcut servis ok:false/exception döndürürse başarı kartına dönüştürme. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0539 | Yorum analizini aç [open_review_analysis] | Seçenek aktarımı: Hedef dil/zaman aralığı/normal seçenekler yalnız seçili işlemin payloadunda doğru kalsın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0540 | Yorum analizini aç [open_review_analysis] | Sonuç ve erişim: Başarı/partial/hata sonrası gerçek çıktı veya yeniden deneme erişilsin; dar EN/TR panelde düğmeler kaybolmasın. | `src/assistant-capabilities.js` | PLANLANDI | — |
| P0541 | Sıcak motor hazır olma ve yeniden kullanım | Tam çıktı: Geçerli ses ve tam grup kanıtında gerçek durum ilerlesin; doğal ses kalitesi iddiası üretme. | `tools/voxcpm2/dub_runtime.py` | PLANLANDI | — |
| P0542 | Sıcak motor hazır olma ve yeniden kullanım | Eksik son grup: Son grubu kontrollü düşür; önceki geçerli parçalar ve eksik grup kimliği korunsun. | `tools/voxcpm2/dub_runtime.py` | PLANLANDI | — |
| P0543 | Sıcak motor hazır olma ve yeniden kullanım | İptal sınırı: Çalışan alt süreci iptal et; close olmadan sahipliği bırakma. | `tools/voxcpm2/dub_runtime.py` | PLANLANDI | — |
| P0544 | Sıcak motor hazır olma ve yeniden kullanım | Referans değişimi: Aynı metinde referans dalgasını değiştir; eski ses/latent yanlış yeniden kullanılmasın. | `tools/voxcpm2/dub_runtime.py` | İNCELENDİ | tests/test_dub_runtime.py4: tam waveform/prompt hash,15→10 adım reload, tail admission1; kontrollü motor. Acquire başarısızlığında uret finally reset ve worker reset kaynakta doğrulandı; hayali bug sayılmadı. |
| P0545 | Sıcak motor hazır olma ve yeniden kullanım | Ayar değişimi: Adım/CFG/gruplama değişiminin ilgili cache ve plan kimliğine etkisini denetle. | `tools/voxcpm2/dub_runtime.py` | İNCELENDİ | tests/test_dub_runtime.py4: tam waveform/prompt hash,15→10 adım reload, tail admission1; kontrollü motor. Acquire başarısızlığında uret finally reset ve worker reset kaynakta doğrulandı; hayali bug sayılmadı. |
| P0546 | Sıcak motor hazır olma ve yeniden kullanım | Süre uyuşmazlığı: Uzun konuşmayı kısa pencereye koy; kesme/yavaşlatma modu açık, sözcük kaybı gizlenmesin. | `tools/voxcpm2/dub_runtime.py` | PLANLANDI | — |
| P0547 | Sıcak motor hazır olma ve yeniden kullanım | Bozuk ses: Boş/kesik/yanlış format sesi başarı veya karşılaştırılabilir çıktı sayma. | `tools/voxcpm2/dub_runtime.py` | PLANLANDI | — |
| P0548 | Sıcak motor hazır olma ve yeniden kullanım | Kaynak bağı: Başka video veya bölüm çıktısını yeni kaynağa otomatik bağlama. | `tools/voxcpm2/dub_runtime.py` | PLANLANDI | — |
| P0549 | Sıcak motor hazır olma ve yeniden kullanım | Sınırlı tekrar: OOM/timeout için sonlu retry; terminal hata kullanıcının referansını gereksiz değişmeye zorlamasın. | `tools/voxcpm2/dub_runtime.py` | PLANLANDI | — |
| P0550 | Sıcak motor hazır olma ve yeniden kullanım | Durum/kanıt: Hazırlık/üretim/doğrulama süreleri ve gerçek kalite durumu ayrı, erişilebilir EN/TR olsun. | `tools/voxcpm2/dub_runtime.py` | PLANLANDI | — |
| P0551 | Son grup timeout ve tekrar tohumu | Tam çıktı: Geçerli ses ve tam grup kanıtında gerçek durum ilerlesin; doğal ses kalitesi iddiası üretme. | `tools/voxcpm2/altyazi_oku.py` | PLANLANDI | — |
| P0552 | Son grup timeout ve tekrar tohumu | Eksik son grup: Son grubu kontrollü düşür; önceki geçerli parçalar ve eksik grup kimliği korunsun. | `tools/voxcpm2/altyazi_oku.py` | İNCELENDİ | tests/test_dub_generation_quality.py20:61grup cache/timeout,seed değişimi ve OOM8→4→2, diğer hata tekrarlanmaz; kontrollü motor, gerçek GPU değil. |
| P0553 | Son grup timeout ve tekrar tohumu | İptal sınırı: Çalışan alt süreci iptal et; close olmadan sahipliği bırakma. | `tools/voxcpm2/altyazi_oku.py` | PLANLANDI | — |
| P0554 | Son grup timeout ve tekrar tohumu | Referans değişimi: Aynı metinde referans dalgasını değiştir; eski ses/latent yanlış yeniden kullanılmasın. | `tools/voxcpm2/altyazi_oku.py` | PLANLANDI | — |
| P0555 | Son grup timeout ve tekrar tohumu | Ayar değişimi: Adım/CFG/gruplama değişiminin ilgili cache ve plan kimliğine etkisini denetle. | `tools/voxcpm2/altyazi_oku.py` | PLANLANDI | — |
| P0556 | Son grup timeout ve tekrar tohumu | Süre uyuşmazlığı: Uzun konuşmayı kısa pencereye koy; kesme/yavaşlatma modu açık, sözcük kaybı gizlenmesin. | `tools/voxcpm2/altyazi_oku.py` | PLANLANDI | — |
| P0557 | Son grup timeout ve tekrar tohumu | Bozuk ses: Boş/kesik/yanlış format sesi başarı veya karşılaştırılabilir çıktı sayma. | `tools/voxcpm2/altyazi_oku.py` | PLANLANDI | — |
| P0558 | Son grup timeout ve tekrar tohumu | Kaynak bağı: Başka video veya bölüm çıktısını yeni kaynağa otomatik bağlama. | `tools/voxcpm2/altyazi_oku.py` | PLANLANDI | — |
| P0559 | Son grup timeout ve tekrar tohumu | Sınırlı tekrar: OOM/timeout için sonlu retry; terminal hata kullanıcının referansını gereksiz değişmeye zorlamasın. | `tools/voxcpm2/altyazi_oku.py` | İNCELENDİ | tests/test_dub_generation_quality.py20:61grup cache/timeout,seed değişimi ve OOM8→4→2, diğer hata tekrarlanmaz; kontrollü motor, gerçek GPU değil. |
| P0560 | Son grup timeout ve tekrar tohumu | Durum/kanıt: Hazırlık/üretim/doğrulama süreleri ve gerçek kalite durumu ayrı, erişilebilir EN/TR olsun. | `tools/voxcpm2/altyazi_oku.py` | PLANLANDI | — |
| P0561 | Motor iptal sınırı | Tam çıktı: Geçerli ses ve tam grup kanıtında gerçek durum ilerlesin; doğal ses kalitesi iddiası üretme. | `tools/voxcpm2/dub_lifecycle.py` | PLANLANDI | — |
| P0562 | Motor iptal sınırı | Eksik son grup: Son grubu kontrollü düşür; önceki geçerli parçalar ve eksik grup kimliği korunsun. | `tools/voxcpm2/dub_lifecycle.py` | PLANLANDI | — |
| P0563 | Motor iptal sınırı | İptal sınırı: Çalışan alt süreci iptal et; close olmadan sahipliği bırakma. | `tools/voxcpm2/dub_lifecycle.py` | PLANLANDI | — |
| P0564 | Motor iptal sınırı | Referans değişimi: Aynı metinde referans dalgasını değiştir; eski ses/latent yanlış yeniden kullanılmasın. | `tools/voxcpm2/dub_lifecycle.py` | PLANLANDI | — |
| P0565 | Motor iptal sınırı | Ayar değişimi: Adım/CFG/gruplama değişiminin ilgili cache ve plan kimliğine etkisini denetle. | `tools/voxcpm2/dub_lifecycle.py` | PLANLANDI | — |
| P0566 | Motor iptal sınırı | Süre uyuşmazlığı: Uzun konuşmayı kısa pencereye koy; kesme/yavaşlatma modu açık, sözcük kaybı gizlenmesin. | `tools/voxcpm2/dub_lifecycle.py` | PLANLANDI | — |
| P0567 | Motor iptal sınırı | Bozuk ses: Boş/kesik/yanlış format sesi başarı veya karşılaştırılabilir çıktı sayma. | `tools/voxcpm2/dub_lifecycle.py` | PLANLANDI | — |
| P0568 | Motor iptal sınırı | Kaynak bağı: Başka video veya bölüm çıktısını yeni kaynağa otomatik bağlama. | `tools/voxcpm2/dub_lifecycle.py` | PLANLANDI | — |
| P0569 | Motor iptal sınırı | Sınırlı tekrar: OOM/timeout için sonlu retry; terminal hata kullanıcının referansını gereksiz değişmeye zorlamasın. | `tools/voxcpm2/dub_lifecycle.py` | PLANLANDI | — |
| P0570 | Motor iptal sınırı | Durum/kanıt: Hazırlık/üretim/doğrulama süreleri ve gerçek kalite durumu ayrı, erişilebilir EN/TR olsun. | `tools/voxcpm2/dub_lifecycle.py` | PLANLANDI | — |
| P0571 | Bitmiş ses parçalarının kurtarılması | Tam çıktı: Geçerli ses ve tam grup kanıtında gerçek durum ilerlesin; doğal ses kalitesi iddiası üretme. | `tools/voxcpm2/dub_resume.py` | PLANLANDI | — |
| P0572 | Bitmiş ses parçalarının kurtarılması | Eksik son grup: Son grubu kontrollü düşür; önceki geçerli parçalar ve eksik grup kimliği korunsun. | `tools/voxcpm2/dub_resume.py` | PLANLANDI | — |
| P0573 | Bitmiş ses parçalarının kurtarılması | İptal sınırı: Çalışan alt süreci iptal et; close olmadan sahipliği bırakma. | `tools/voxcpm2/dub_resume.py` | PLANLANDI | — |
| P0574 | Bitmiş ses parçalarının kurtarılması | Referans değişimi: Aynı metinde referans dalgasını değiştir; eski ses/latent yanlış yeniden kullanılmasın. | `tools/voxcpm2/dub_resume.py` | PLANLANDI | — |
| P0575 | Bitmiş ses parçalarının kurtarılması | Ayar değişimi: Adım/CFG/gruplama değişiminin ilgili cache ve plan kimliğine etkisini denetle. | `tools/voxcpm2/dub_resume.py` | PLANLANDI | — |
| P0576 | Bitmiş ses parçalarının kurtarılması | Süre uyuşmazlığı: Uzun konuşmayı kısa pencereye koy; kesme/yavaşlatma modu açık, sözcük kaybı gizlenmesin. | `tools/voxcpm2/dub_resume.py` | PLANLANDI | — |
| P0577 | Bitmiş ses parçalarının kurtarılması | Bozuk ses: Boş/kesik/yanlış format sesi başarı veya karşılaştırılabilir çıktı sayma. | `tools/voxcpm2/dub_resume.py` | PLANLANDI | — |
| P0578 | Bitmiş ses parçalarının kurtarılması | Kaynak bağı: Başka video veya bölüm çıktısını yeni kaynağa otomatik bağlama. | `tools/voxcpm2/dub_resume.py` | PLANLANDI | — |
| P0579 | Bitmiş ses parçalarının kurtarılması | Sınırlı tekrar: OOM/timeout için sonlu retry; terminal hata kullanıcının referansını gereksiz değişmeye zorlamasın. | `tools/voxcpm2/dub_resume.py` | PLANLANDI | — |
| P0580 | Bitmiş ses parçalarının kurtarılması | Durum/kanıt: Hazırlık/üretim/doğrulama süreleri ve gerçek kalite durumu ayrı, erişilebilir EN/TR olsun. | `tools/voxcpm2/dub_resume.py` | PLANLANDI | — |
| P0581 | Kısa/gruplu konuşma iyileştirme | Tam çıktı: Geçerli ses ve tam grup kanıtında gerçek durum ilerlesin; doğal ses kalitesi iddiası üretme. | `tools/voxcpm2/dub_recovery.py` | PLANLANDI | — |
| P0582 | Kısa/gruplu konuşma iyileştirme | Eksik son grup: Son grubu kontrollü düşür; önceki geçerli parçalar ve eksik grup kimliği korunsun. | `tools/voxcpm2/dub_recovery.py` | PLANLANDI | — |
| P0583 | Kısa/gruplu konuşma iyileştirme | İptal sınırı: Çalışan alt süreci iptal et; close olmadan sahipliği bırakma. | `tools/voxcpm2/dub_recovery.py` | PLANLANDI | — |
| P0584 | Kısa/gruplu konuşma iyileştirme | Referans değişimi: Aynı metinde referans dalgasını değiştir; eski ses/latent yanlış yeniden kullanılmasın. | `tools/voxcpm2/dub_recovery.py` | PLANLANDI | — |
| P0585 | Kısa/gruplu konuşma iyileştirme | Ayar değişimi: Adım/CFG/gruplama değişiminin ilgili cache ve plan kimliğine etkisini denetle. | `tools/voxcpm2/dub_recovery.py` | PLANLANDI | — |
| P0586 | Kısa/gruplu konuşma iyileştirme | Süre uyuşmazlığı: Uzun konuşmayı kısa pencereye koy; kesme/yavaşlatma modu açık, sözcük kaybı gizlenmesin. | `tools/voxcpm2/dub_recovery.py` | PLANLANDI | — |
| P0587 | Kısa/gruplu konuşma iyileştirme | Bozuk ses: Boş/kesik/yanlış format sesi başarı veya karşılaştırılabilir çıktı sayma. | `tools/voxcpm2/dub_recovery.py` | PLANLANDI | — |
| P0588 | Kısa/gruplu konuşma iyileştirme | Kaynak bağı: Başka video veya bölüm çıktısını yeni kaynağa otomatik bağlama. | `tools/voxcpm2/dub_recovery.py` | PLANLANDI | — |
| P0589 | Kısa/gruplu konuşma iyileştirme | Sınırlı tekrar: OOM/timeout için sonlu retry; terminal hata kullanıcının referansını gereksiz değişmeye zorlamasın. | `tools/voxcpm2/dub_recovery.py` | PLANLANDI | — |
| P0590 | Kısa/gruplu konuşma iyileştirme | Durum/kanıt: Hazırlık/üretim/doğrulama süreleri ve gerçek kalite durumu ayrı, erişilebilir EN/TR olsun. | `tools/voxcpm2/dub_recovery.py` | PLANLANDI | — |
| P0591 | Türkçe okunuş ve sayı normalizasyonu | Anlam ve sözcük: Özne/nesne/koşul ve anlamlı tekrarın korunmasını gerçek örnekle karşılaştır. | `tools/voxcpm2/dub_finish.py` | PLANLANDI | — |
| P0592 | Türkçe okunuş ve sayı normalizasyonu | Sayı ve birim: Saat, para, yüzde ve işaretli miktarlar hatalı dönüştüğünde açık uyarı; doğru doğal biçim yanlış reddedilmesin. | `tools/voxcpm2/dub_finish.py` | PLANLANDI | — |
| P0593 | Türkçe okunuş ve sayı normalizasyonu | Olumsuzluk ve kip: Negatif/modal anlam kaybını yakala; nominal Türkçe ve temporal before bağlamını yanlış negatif sanma. | `tools/voxcpm2/dub_finish.py` | PLANLANDI | — |
| P0594 | Türkçe okunuş ve sayı normalizasyonu | Komşu bağlam: Kısa replikte önce/sonra bağlam kullanılsın; komşu cümleyi hedefe kopyalama. | `tools/voxcpm2/dub_finish.py` | PLANLANDI | — |
| P0595 | Türkçe okunuş ve sayı normalizasyonu | Konuşmacı sınırı: Farklı konuşmacı veya sahne replikleri anlamı değiştirecek biçimde birleşmesin. | `tools/voxcpm2/dub_finish.py` | PLANLANDI | — |
| P0596 | Türkçe okunuş ve sayı normalizasyonu | Kısmi yanıt: Eksik/boş/dil değiştirmemiş satırı tam çıktı sayma; eksik kimlikler görünür kalsın. | `tools/voxcpm2/dub_finish.py` | PLANLANDI | — |
| P0597 | Türkçe okunuş ve sayı normalizasyonu | İptal ve revizyon: İptalden/kaynak değişiminden sonra geç çeviriyi yeni metne uygulama. | `tools/voxcpm2/dub_finish.py` | PLANLANDI | — |
| P0598 | Türkçe okunuş ve sayı normalizasyonu | Cache ayrımı: Aynı kısa metin farklı bağlam/model/refine ayarında yanlış sonuç paylaşmasın. | `tools/voxcpm2/dub_finish.py` | PLANLANDI | — |
| P0599 | Türkçe okunuş ve sayı normalizasyonu | Süre ve doğal ifade: Süreye sığma isteği anlamı özetlemeye çevrilmesin; KPS ölçümü gerçek ses süresi diye sunulmasın. | `tools/voxcpm2/dub_finish.py` | PLANLANDI | — |
| P0600 | Türkçe okunuş ve sayı normalizasyonu | Unicode ve format: BOM/cp1254/UTF16/Türkçe birleşen karakterlerde içerik ve cue zamanları korunsun. | `tools/voxcpm2/dub_finish.py` | PLANLANDI | — |
| P0601 | Akıcı cümle grupları | Anlam ve sözcük: Özne/nesne/koşul ve anlamlı tekrarın korunmasını gerçek örnekle karşılaştır. | `tools/voxcpm2/dub_utterance.py` | PLANLANDI | — |
| P0602 | Akıcı cümle grupları | Sayı ve birim: Saat, para, yüzde ve işaretli miktarlar hatalı dönüştüğünde açık uyarı; doğru doğal biçim yanlış reddedilmesin. | `tools/voxcpm2/dub_utterance.py` | PLANLANDI | — |
| P0603 | Akıcı cümle grupları | Olumsuzluk ve kip: Negatif/modal anlam kaybını yakala; nominal Türkçe ve temporal before bağlamını yanlış negatif sanma. | `tools/voxcpm2/dub_utterance.py` | PLANLANDI | — |
| P0604 | Akıcı cümle grupları | Komşu bağlam: Kısa replikte önce/sonra bağlam kullanılsın; komşu cümleyi hedefe kopyalama. | `tools/voxcpm2/dub_utterance.py` | PLANLANDI | — |
| P0605 | Akıcı cümle grupları | Konuşmacı sınırı: Farklı konuşmacı veya sahne replikleri anlamı değiştirecek biçimde birleşmesin. | `tools/voxcpm2/dub_utterance.py` | PLANLANDI | — |
| P0606 | Akıcı cümle grupları | Kısmi yanıt: Eksik/boş/dil değiştirmemiş satırı tam çıktı sayma; eksik kimlikler görünür kalsın. | `tools/voxcpm2/dub_utterance.py` | PLANLANDI | — |
| P0607 | Akıcı cümle grupları | İptal ve revizyon: İptalden/kaynak değişiminden sonra geç çeviriyi yeni metne uygulama. | `tools/voxcpm2/dub_utterance.py` | PLANLANDI | — |
| P0608 | Akıcı cümle grupları | Cache ayrımı: Aynı kısa metin farklı bağlam/model/refine ayarında yanlış sonuç paylaşmasın. | `tools/voxcpm2/dub_utterance.py` | PLANLANDI | — |
| P0609 | Akıcı cümle grupları | Süre ve doğal ifade: Süreye sığma isteği anlamı özetlemeye çevrilmesin; KPS ölçümü gerçek ses süresi diye sunulmasın. | `tools/voxcpm2/dub_utterance.py` | PLANLANDI | — |
| P0610 | Akıcı cümle grupları | Unicode ve format: BOM/cp1254/UTF16/Türkçe birleşen karakterlerde içerik ve cue zamanları korunsun. | `tools/voxcpm2/dub_utterance.py` | PLANLANDI | — |
| P0611 | Ses kalite ve cache kanıtı | Tam çıktı: Geçerli ses ve tam grup kanıtında gerçek durum ilerlesin; doğal ses kalitesi iddiası üretme. | `tools/voxcpm2/dub_quality.py` | PLANLANDI | — |
| P0612 | Ses kalite ve cache kanıtı | Eksik son grup: Son grubu kontrollü düşür; önceki geçerli parçalar ve eksik grup kimliği korunsun. | `tools/voxcpm2/dub_quality.py` | PLANLANDI | — |
| P0613 | Ses kalite ve cache kanıtı | İptal sınırı: Çalışan alt süreci iptal et; close olmadan sahipliği bırakma. | `tools/voxcpm2/dub_quality.py` | PLANLANDI | — |
| P0614 | Ses kalite ve cache kanıtı | Referans değişimi: Aynı metinde referans dalgasını değiştir; eski ses/latent yanlış yeniden kullanılmasın. | `tools/voxcpm2/dub_quality.py` | PLANLANDI | — |
| P0615 | Ses kalite ve cache kanıtı | Ayar değişimi: Adım/CFG/gruplama değişiminin ilgili cache ve plan kimliğine etkisini denetle. | `tools/voxcpm2/dub_quality.py` | PLANLANDI | — |
| P0616 | Ses kalite ve cache kanıtı | Süre uyuşmazlığı: Uzun konuşmayı kısa pencereye koy; kesme/yavaşlatma modu açık, sözcük kaybı gizlenmesin. | `tools/voxcpm2/dub_quality.py` | PLANLANDI | — |
| P0617 | Ses kalite ve cache kanıtı | Bozuk ses: Boş/kesik/yanlış format sesi başarı veya karşılaştırılabilir çıktı sayma. | `tools/voxcpm2/dub_quality.py` | PLANLANDI | — |
| P0618 | Ses kalite ve cache kanıtı | Kaynak bağı: Başka video veya bölüm çıktısını yeni kaynağa otomatik bağlama. | `tools/voxcpm2/dub_quality.py` | PLANLANDI | — |
| P0619 | Ses kalite ve cache kanıtı | Sınırlı tekrar: OOM/timeout için sonlu retry; terminal hata kullanıcının referansını gereksiz değişmeye zorlamasın. | `tools/voxcpm2/dub_quality.py` | PLANLANDI | — |
| P0620 | Ses kalite ve cache kanıtı | Durum/kanıt: Hazırlık/üretim/doğrulama süreleri ve gerçek kalite durumu ayrı, erişilebilir EN/TR olsun. | `tools/voxcpm2/dub_quality.py` | PLANLANDI | — |
| P0621 | Video yavaşlatma zaman haritası | Orijinal eksen: Clip offset cue, kelime ve ses zamanına tam bir kez uygulansın. | `tools/voxcpm2/dub_timing.py` | PLANLANDI | — |
| P0622 | Video yavaşlatma zaman haritası | Aralık sınırı: Başlangıç/bitiş kesişiminde içerik kaybolmasın, aralık dışı özgün ses davranışı açık olsun. | `tools/voxcpm2/dub_timing.py` | PLANLANDI | — |
| P0623 | Video yavaşlatma zaman haritası | Seek ileri: Yeni zamanda doğru cue/ses/grup bulunur; eski play promise yeni oturumu durdurmasın. | `tools/voxcpm2/dub_timing.py` | PLANLANDI | — |
| P0624 | Video yavaşlatma zaman haritası | Seek geri: Daha önce oynatılmış bölgeye dönüşte doğru senkron ve tekrar durumu korunsun. | `tools/voxcpm2/dub_timing.py` | PLANLANDI | — |
| P0625 | Video yavaşlatma zaman haritası | Hız değişimi: Süreye sığmayan konuşmada video/ses haritası monoton ve sonlu kalsın. | `tools/voxcpm2/dub_timing.py` | PLANLANDI | — |
| P0626 | Video yavaşlatma zaman haritası | Kaynak revizyonu: Başka video/bölüm zaman haritası yeni kaynağa uygulanmasın. | `tools/voxcpm2/dub_timing.py` | PLANLANDI | — |
| P0627 | Video yavaşlatma zaman haritası | Son parça: Son ses ve video bitişinde kırpma/taşma/gap açık raporlansın. | `tools/voxcpm2/dub_timing.py` | PLANLANDI | — |
| P0628 | Video yavaşlatma zaman haritası | Sessiz boşluk: Konuşmasız aralıklar senkronu kaydırmasın ve sahte ses başarısı sayılmasın. | `tools/voxcpm2/dub_timing.py` | PLANLANDI | — |
| P0629 | Video yavaşlatma zaman haritası | Geçersiz zaman: NaN/Infinity/negatif/ters zaman güvenli reddedilsin. | `tools/voxcpm2/dub_timing.py` | PLANLANDI | — |
| P0630 | Video yavaşlatma zaman haritası | Kullanıcı kontrolü: Manuel scroll/seek/hız tercihi otomatik takip tarafından istemsiz geri alınmasın. | `tools/voxcpm2/dub_timing.py` | PLANLANDI | — |
| P0631 | Özgün konuşma ritmi planı | Orijinal eksen: Clip offset cue, kelime ve ses zamanına tam bir kez uygulansın. | `tools/voxcpm2/dub_prosody.py` | PLANLANDI | — |
| P0632 | Özgün konuşma ritmi planı | Aralık sınırı: Başlangıç/bitiş kesişiminde içerik kaybolmasın, aralık dışı özgün ses davranışı açık olsun. | `tools/voxcpm2/dub_prosody.py` | PLANLANDI | — |
| P0633 | Özgün konuşma ritmi planı | Seek ileri: Yeni zamanda doğru cue/ses/grup bulunur; eski play promise yeni oturumu durdurmasın. | `tools/voxcpm2/dub_prosody.py` | PLANLANDI | — |
| P0634 | Özgün konuşma ritmi planı | Seek geri: Daha önce oynatılmış bölgeye dönüşte doğru senkron ve tekrar durumu korunsun. | `tools/voxcpm2/dub_prosody.py` | PLANLANDI | — |
| P0635 | Özgün konuşma ritmi planı | Hız değişimi: Süreye sığmayan konuşmada video/ses haritası monoton ve sonlu kalsın. | `tools/voxcpm2/dub_prosody.py` | PLANLANDI | — |
| P0636 | Özgün konuşma ritmi planı | Kaynak revizyonu: Başka video/bölüm zaman haritası yeni kaynağa uygulanmasın. | `tools/voxcpm2/dub_prosody.py` | PLANLANDI | — |
| P0637 | Özgün konuşma ritmi planı | Son parça: Son ses ve video bitişinde kırpma/taşma/gap açık raporlansın. | `tools/voxcpm2/dub_prosody.py` | PLANLANDI | — |
| P0638 | Özgün konuşma ritmi planı | Sessiz boşluk: Konuşmasız aralıklar senkronu kaydırmasın ve sahte ses başarısı sayılmasın. | `tools/voxcpm2/dub_prosody.py` | PLANLANDI | — |
| P0639 | Özgün konuşma ritmi planı | Geçersiz zaman: NaN/Infinity/negatif/ters zaman güvenli reddedilsin. | `tools/voxcpm2/dub_prosody.py` | PLANLANDI | — |
| P0640 | Özgün konuşma ritmi planı | Kullanıcı kontrolü: Manuel scroll/seek/hız tercihi otomatik takip tarafından istemsiz geri alınmasın. | `tools/voxcpm2/dub_prosody.py` | PLANLANDI | — |
| P0641 | Telaffuz sözlüğü | Anlam ve sözcük: Özne/nesne/koşul ve anlamlı tekrarın korunmasını gerçek örnekle karşılaştır. | `tools/voxcpm2/dub_pronunciation.py` | PLANLANDI | — |
| P0642 | Telaffuz sözlüğü | Sayı ve birim: Saat, para, yüzde ve işaretli miktarlar hatalı dönüştüğünde açık uyarı; doğru doğal biçim yanlış reddedilmesin. | `tools/voxcpm2/dub_pronunciation.py` | PLANLANDI | — |
| P0643 | Telaffuz sözlüğü | Olumsuzluk ve kip: Negatif/modal anlam kaybını yakala; nominal Türkçe ve temporal before bağlamını yanlış negatif sanma. | `tools/voxcpm2/dub_pronunciation.py` | PLANLANDI | — |
| P0644 | Telaffuz sözlüğü | Komşu bağlam: Kısa replikte önce/sonra bağlam kullanılsın; komşu cümleyi hedefe kopyalama. | `tools/voxcpm2/dub_pronunciation.py` | PLANLANDI | — |
| P0645 | Telaffuz sözlüğü | Konuşmacı sınırı: Farklı konuşmacı veya sahne replikleri anlamı değiştirecek biçimde birleşmesin. | `tools/voxcpm2/dub_pronunciation.py` | PLANLANDI | — |
| P0646 | Telaffuz sözlüğü | Kısmi yanıt: Eksik/boş/dil değiştirmemiş satırı tam çıktı sayma; eksik kimlikler görünür kalsın. | `tools/voxcpm2/dub_pronunciation.py` | PLANLANDI | — |
| P0647 | Telaffuz sözlüğü | İptal ve revizyon: İptalden/kaynak değişiminden sonra geç çeviriyi yeni metne uygulama. | `tools/voxcpm2/dub_pronunciation.py` | PLANLANDI | — |
| P0648 | Telaffuz sözlüğü | Cache ayrımı: Aynı kısa metin farklı bağlam/model/refine ayarında yanlış sonuç paylaşmasın. | `tools/voxcpm2/dub_pronunciation.py` | PLANLANDI | — |
| P0649 | Telaffuz sözlüğü | Süre ve doğal ifade: Süreye sığma isteği anlamı özetlemeye çevrilmesin; KPS ölçümü gerçek ses süresi diye sunulmasın. | `tools/voxcpm2/dub_pronunciation.py` | PLANLANDI | — |
| P0650 | Telaffuz sözlüğü | Unicode ve format: BOM/cp1254/UTF16/Türkçe birleşen karakterlerde içerik ve cue zamanları korunsun. | `tools/voxcpm2/dub_pronunciation.py` | PLANLANDI | — |
| P0651 | Uzun yaşayan worker protokolü | Başlama ve gerçek kimlik: Başlatılan alt iş/süreç kimliğini gerçek kayda bağla. | `src/dub-engine-worker.js` | İNCELENDİ | dub-engine-worker11 test, Native ENOENT dahil;19 dosyalar-arası kontrol tamam. Sandbox EPERM ilk koşu kırmızı; aynı test escalation ile geçti. Boyut üst sınırının tamamı değil bu pakette split/late stderr kapsandı. |
| P0652 | Uzun yaşayan worker protokolü | Spawn başarısızlığı: Süreç doğmadan hata gelince kilidi bırak ve kullanıcıya anlamlı hata döndür. | `src/dub-engine-worker.js` | İNCELENDİ | dub-engine-worker11 test, Native ENOENT dahil;19 dosyalar-arası kontrol tamam. Sandbox EPERM ilk koşu kırmızı; aynı test escalation ile geçti. Boyut üst sınırının tamamı değil bu pakette split/late stderr kapsandı. |
| P0653 | Uzun yaşayan worker protokolü | Canlı süreçte error: Kill/send hatasında süreç hâlâ canlıysa sahipliği erken bırakma. | `src/dub-engine-worker.js` | İNCELENDİ | dub-engine-worker11 test, Native ENOENT dahil;19 dosyalar-arası kontrol tamam. Sandbox EPERM ilk koşu kırmızı; aynı test escalation ile geçti. Boyut üst sınırının tamamı değil bu pakette split/late stderr kapsandı. |
| P0654 | Uzun yaşayan worker protokolü | İptal/close yarışı: İptal sonrası geç done/close ikinci başarı veya başka işin kapatılmasını üretmesin. | `src/dub-engine-worker.js` | İNCELENDİ | dub-engine-worker11 test, Native ENOENT dahil;19 dosyalar-arası kontrol tamam. Sandbox EPERM ilk koşu kırmızı; aynı test escalation ile geçti. Boyut üst sınırının tamamı değil bu pakette split/late stderr kapsandı. |
| P0655 | Uzun yaşayan worker protokolü | Çıktı sınırı: Uzun stdout/stderr protokolü belleği sınırsız büyütmesin ve yarım satır doğru toplansın. | `src/dub-engine-worker.js` | İNCELENDİ | dub-engine-worker11 test, Native ENOENT dahil;19 dosyalar-arası kontrol tamam. Sandbox EPERM ilk koşu kırmızı; aynı test escalation ile geçti. Boyut üst sınırının tamamı değil bu pakette split/late stderr kapsandı. |
| P0656 | Uzun yaşayan worker protokolü | Timeout: Sessiz takılmada sonlu zaman sınırı ve doğrulanabilir durdurma sonucu olsun. | `src/dub-engine-worker.js` | PLANLANDI | — |
| P0657 | Uzun yaşayan worker protokolü | Tekrar başlatma: Önceki süreç kapanmadıysa yeni iş çakışmasın; kapanınca retry mümkün olsun. | `src/dub-engine-worker.js` | İNCELENDİ | dub-engine-worker11 test, Native ENOENT dahil;19 dosyalar-arası kontrol tamam. Sandbox EPERM ilk koşu kırmızı; aynı test escalation ile geçti. Boyut üst sınırının tamamı değil bu pakette split/late stderr kapsandı. |
| P0658 | Uzun yaşayan worker protokolü | Kaynak değişimi: Bekleyen işlemin sonucu başka sekme/bölüm/ses kaynağına uygulanmasın. | `src/dub-engine-worker.js` | PLANLANDI | — |
| P0659 | Uzun yaşayan worker protokolü | Gizli veri: İstek argv/log/diagnostic hassas verileri açığa çıkarmasın. | `src/dub-engine-worker.js` | PLANLANDI | — |
| P0660 | Uzun yaşayan worker protokolü | Windows yolu: Boşluk/apostrof/Türkçe yol ve windowsHide/alt süreç env değişen kapıda korunsun. | `src/dub-engine-worker.js` | İNCELENDİ | dub-engine-worker11 test, Native ENOENT dahil;19 dosyalar-arası kontrol tamam. Sandbox EPERM ilk koşu kırmızı; aynı test escalation ile geçti. Boyut üst sınırının tamamı değil bu pakette split/late stderr kapsandı. |
| P0661 | Dublaj ana süreç sonlandırma | Başlama ve gerçek kimlik: Başlatılan alt iş/süreç kimliğini gerçek kayda bağla. | `src/dub-service.js` | PLANLANDI | — |
| P0662 | Dublaj ana süreç sonlandırma | Spawn başarısızlığı: Süreç doğmadan hata gelince kilidi bırak ve kullanıcıya anlamlı hata döndür. | `src/dub-service.js` | PLANLANDI | — |
| P0663 | Dublaj ana süreç sonlandırma | Canlı süreçte error: Kill/send hatasında süreç hâlâ canlıysa sahipliği erken bırakma. | `src/dub-service.js` | PLANLANDI | — |
| P0664 | Dublaj ana süreç sonlandırma | İptal/close yarışı: İptal sonrası geç done/close ikinci başarı veya başka işin kapatılmasını üretmesin. | `src/dub-service.js` | PLANLANDI | — |
| P0665 | Dublaj ana süreç sonlandırma | Çıktı sınırı: Uzun stdout/stderr protokolü belleği sınırsız büyütmesin ve yarım satır doğru toplansın. | `src/dub-service.js` | PLANLANDI | — |
| P0666 | Dublaj ana süreç sonlandırma | Timeout: Sessiz takılmada sonlu zaman sınırı ve doğrulanabilir durdurma sonucu olsun. | `src/dub-service.js` | PLANLANDI | — |
| P0667 | Dublaj ana süreç sonlandırma | Tekrar başlatma: Önceki süreç kapanmadıysa yeni iş çakışmasın; kapanınca retry mümkün olsun. | `src/dub-service.js` | PLANLANDI | — |
| P0668 | Dublaj ana süreç sonlandırma | Kaynak değişimi: Bekleyen işlemin sonucu başka sekme/bölüm/ses kaynağına uygulanmasın. | `src/dub-service.js` | PLANLANDI | — |
| P0669 | Dublaj ana süreç sonlandırma | Gizli veri: İstek argv/log/diagnostic hassas verileri açığa çıkarmasın. | `src/dub-service.js` | PLANLANDI | — |
| P0670 | Dublaj ana süreç sonlandırma | Windows yolu: Boşluk/apostrof/Türkçe yol ve windowsHide/alt süreç env değişen kapıda korunsun. | `src/dub-service.js` | PLANLANDI | — |
| P0671 | Müzik ve ortam ayrıştırma | Tam çıktı: Geçerli ses ve tam grup kanıtında gerçek durum ilerlesin; doğal ses kalitesi iddiası üretme. | `src/dub-background.js` | PLANLANDI | — |
| P0672 | Müzik ve ortam ayrıştırma | Eksik son grup: Son grubu kontrollü düşür; önceki geçerli parçalar ve eksik grup kimliği korunsun. | `src/dub-background.js` | PLANLANDI | — |
| P0673 | Müzik ve ortam ayrıştırma | İptal sınırı: Çalışan alt süreci iptal et; close olmadan sahipliği bırakma. | `src/dub-background.js` | PLANLANDI | — |
| P0674 | Müzik ve ortam ayrıştırma | Referans değişimi: Aynı metinde referans dalgasını değiştir; eski ses/latent yanlış yeniden kullanılmasın. | `src/dub-background.js` | PLANLANDI | — |
| P0675 | Müzik ve ortam ayrıştırma | Ayar değişimi: Adım/CFG/gruplama değişiminin ilgili cache ve plan kimliğine etkisini denetle. | `src/dub-background.js` | PLANLANDI | — |
| P0676 | Müzik ve ortam ayrıştırma | Süre uyuşmazlığı: Uzun konuşmayı kısa pencereye koy; kesme/yavaşlatma modu açık, sözcük kaybı gizlenmesin. | `src/dub-background.js` | PLANLANDI | — |
| P0677 | Müzik ve ortam ayrıştırma | Bozuk ses: Boş/kesik/yanlış format sesi başarı veya karşılaştırılabilir çıktı sayma. | `src/dub-background.js` | PLANLANDI | — |
| P0678 | Müzik ve ortam ayrıştırma | Kaynak bağı: Başka video veya bölüm çıktısını yeni kaynağa otomatik bağlama. | `src/dub-background.js` | PLANLANDI | — |
| P0679 | Müzik ve ortam ayrıştırma | Sınırlı tekrar: OOM/timeout için sonlu retry; terminal hata kullanıcının referansını gereksiz değişmeye zorlamasın. | `src/dub-background.js` | PLANLANDI | — |
| P0680 | Müzik ve ortam ayrıştırma | Durum/kanıt: Hazırlık/üretim/doğrulama süreleri ve gerçek kalite durumu ayrı, erişilebilir EN/TR olsun. | `src/dub-background.js` | PLANLANDI | — |
| P0681 | Referans hazırlama alt süreci | Başlama ve gerçek kimlik: Başlatılan alt iş/süreç kimliğini gerçek kayda bağla. | `src/voice-reference.js` | PLANLANDI | — |
| P0682 | Referans hazırlama alt süreci | Spawn başarısızlığı: Süreç doğmadan hata gelince kilidi bırak ve kullanıcıya anlamlı hata döndür. | `src/voice-reference.js` | PLANLANDI | — |
| P0683 | Referans hazırlama alt süreci | Canlı süreçte error: Kill/send hatasında süreç hâlâ canlıysa sahipliği erken bırakma. | `src/voice-reference.js` | PLANLANDI | — |
| P0684 | Referans hazırlama alt süreci | İptal/close yarışı: İptal sonrası geç done/close ikinci başarı veya başka işin kapatılmasını üretmesin. | `src/voice-reference.js` | PLANLANDI | — |
| P0685 | Referans hazırlama alt süreci | Çıktı sınırı: Uzun stdout/stderr protokolü belleği sınırsız büyütmesin ve yarım satır doğru toplansın. | `src/voice-reference.js` | PLANLANDI | — |
| P0686 | Referans hazırlama alt süreci | Timeout: Sessiz takılmada sonlu zaman sınırı ve doğrulanabilir durdurma sonucu olsun. | `src/voice-reference.js` | PLANLANDI | — |
| P0687 | Referans hazırlama alt süreci | Tekrar başlatma: Önceki süreç kapanmadıysa yeni iş çakışmasın; kapanınca retry mümkün olsun. | `src/voice-reference.js` | PLANLANDI | — |
| P0688 | Referans hazırlama alt süreci | Kaynak değişimi: Bekleyen işlemin sonucu başka sekme/bölüm/ses kaynağına uygulanmasın. | `src/voice-reference.js` | PLANLANDI | — |
| P0689 | Referans hazırlama alt süreci | Gizli veri: İstek argv/log/diagnostic hassas verileri açığa çıkarmasın. | `src/voice-reference.js` | PLANLANDI | — |
| P0690 | Referans hazırlama alt süreci | Windows yolu: Boşluk/apostrof/Türkçe yol ve windowsHide/alt süreç env değişen kapıda korunsun. | `src/voice-reference.js` | PLANLANDI | — |
| P0691 | Yerel/video referans çıkarma | Tam çıktı: Geçerli ses ve tam grup kanıtında gerçek durum ilerlesin; doğal ses kalitesi iddiası üretme. | `backend/voice_reference.py` | PLANLANDI | — |
| P0692 | Yerel/video referans çıkarma | Eksik son grup: Son grubu kontrollü düşür; önceki geçerli parçalar ve eksik grup kimliği korunsun. | `backend/voice_reference.py` | PLANLANDI | — |
| P0693 | Yerel/video referans çıkarma | İptal sınırı: Çalışan alt süreci iptal et; close olmadan sahipliği bırakma. | `backend/voice_reference.py` | PLANLANDI | — |
| P0694 | Yerel/video referans çıkarma | Referans değişimi: Aynı metinde referans dalgasını değiştir; eski ses/latent yanlış yeniden kullanılmasın. | `backend/voice_reference.py` | PLANLANDI | — |
| P0695 | Yerel/video referans çıkarma | Ayar değişimi: Adım/CFG/gruplama değişiminin ilgili cache ve plan kimliğine etkisini denetle. | `backend/voice_reference.py` | PLANLANDI | — |
| P0696 | Yerel/video referans çıkarma | Süre uyuşmazlığı: Uzun konuşmayı kısa pencereye koy; kesme/yavaşlatma modu açık, sözcük kaybı gizlenmesin. | `backend/voice_reference.py` | PLANLANDI | — |
| P0697 | Yerel/video referans çıkarma | Bozuk ses: Boş/kesik/yanlış format sesi başarı veya karşılaştırılabilir çıktı sayma. | `backend/voice_reference.py` | PLANLANDI | — |
| P0698 | Yerel/video referans çıkarma | Kaynak bağı: Başka video veya bölüm çıktısını yeni kaynağa otomatik bağlama. | `backend/voice_reference.py` | PLANLANDI | — |
| P0699 | Yerel/video referans çıkarma | Sınırlı tekrar: OOM/timeout için sonlu retry; terminal hata kullanıcının referansını gereksiz değişmeye zorlamasın. | `backend/voice_reference.py` | PLANLANDI | — |
| P0700 | Yerel/video referans çıkarma | Durum/kanıt: Hazırlık/üretim/doğrulama süreleri ve gerçek kalite durumu ayrı, erişilebilir EN/TR olsun. | `backend/voice_reference.py` | PLANLANDI | — |
| P0701 | WAV/RF64 bütünlüğü | Tam çıktı: Geçerli ses ve tam grup kanıtında gerçek durum ilerlesin; doğal ses kalitesi iddiası üretme. | `src/voice-output.js` | PLANLANDI | — |
| P0702 | WAV/RF64 bütünlüğü | Eksik son grup: Son grubu kontrollü düşür; önceki geçerli parçalar ve eksik grup kimliği korunsun. | `src/voice-output.js` | PLANLANDI | — |
| P0703 | WAV/RF64 bütünlüğü | İptal sınırı: Çalışan alt süreci iptal et; close olmadan sahipliği bırakma. | `src/voice-output.js` | PLANLANDI | — |
| P0704 | WAV/RF64 bütünlüğü | Referans değişimi: Aynı metinde referans dalgasını değiştir; eski ses/latent yanlış yeniden kullanılmasın. | `src/voice-output.js` | PLANLANDI | — |
| P0705 | WAV/RF64 bütünlüğü | Ayar değişimi: Adım/CFG/gruplama değişiminin ilgili cache ve plan kimliğine etkisini denetle. | `src/voice-output.js` | PLANLANDI | — |
| P0706 | WAV/RF64 bütünlüğü | Süre uyuşmazlığı: Uzun konuşmayı kısa pencereye koy; kesme/yavaşlatma modu açık, sözcük kaybı gizlenmesin. | `src/voice-output.js` | PLANLANDI | — |
| P0707 | WAV/RF64 bütünlüğü | Bozuk ses: Boş/kesik/yanlış format sesi başarı veya karşılaştırılabilir çıktı sayma. | `src/voice-output.js` | PLANLANDI | — |
| P0708 | WAV/RF64 bütünlüğü | Kaynak bağı: Başka video veya bölüm çıktısını yeni kaynağa otomatik bağlama. | `src/voice-output.js` | PLANLANDI | — |
| P0709 | WAV/RF64 bütünlüğü | Sınırlı tekrar: OOM/timeout için sonlu retry; terminal hata kullanıcının referansını gereksiz değişmeye zorlamasın. | `src/voice-output.js` | PLANLANDI | — |
| P0710 | WAV/RF64 bütünlüğü | Durum/kanıt: Hazırlık/üretim/doğrulama süreleri ve gerçek kalite durumu ayrı, erişilebilir EN/TR olsun. | `src/voice-output.js` | PLANLANDI | — |
| P0711 | Grup ASR doğrulaması | Tam çıktı: Geçerli ses ve tam grup kanıtında gerçek durum ilerlesin; doğal ses kalitesi iddiası üretme. | `backend/dub_verify.py` | PLANLANDI | — |
| P0712 | Grup ASR doğrulaması | Eksik son grup: Son grubu kontrollü düşür; önceki geçerli parçalar ve eksik grup kimliği korunsun. | `backend/dub_verify.py` | PLANLANDI | — |
| P0713 | Grup ASR doğrulaması | İptal sınırı: Çalışan alt süreci iptal et; close olmadan sahipliği bırakma. | `backend/dub_verify.py` | PLANLANDI | — |
| P0714 | Grup ASR doğrulaması | Referans değişimi: Aynı metinde referans dalgasını değiştir; eski ses/latent yanlış yeniden kullanılmasın. | `backend/dub_verify.py` | PLANLANDI | — |
| P0715 | Grup ASR doğrulaması | Ayar değişimi: Adım/CFG/gruplama değişiminin ilgili cache ve plan kimliğine etkisini denetle. | `backend/dub_verify.py` | PLANLANDI | — |
| P0716 | Grup ASR doğrulaması | Süre uyuşmazlığı: Uzun konuşmayı kısa pencereye koy; kesme/yavaşlatma modu açık, sözcük kaybı gizlenmesin. | `backend/dub_verify.py` | PLANLANDI | — |
| P0717 | Grup ASR doğrulaması | Bozuk ses: Boş/kesik/yanlış format sesi başarı veya karşılaştırılabilir çıktı sayma. | `backend/dub_verify.py` | PLANLANDI | — |
| P0718 | Grup ASR doğrulaması | Kaynak bağı: Başka video veya bölüm çıktısını yeni kaynağa otomatik bağlama. | `backend/dub_verify.py` | PLANLANDI | — |
| P0719 | Grup ASR doğrulaması | Sınırlı tekrar: OOM/timeout için sonlu retry; terminal hata kullanıcının referansını gereksiz değişmeye zorlamasın. | `backend/dub_verify.py` | PLANLANDI | — |
| P0720 | Grup ASR doğrulaması | Durum/kanıt: Hazırlık/üretim/doğrulama süreleri ve gerçek kalite durumu ayrı, erişilebilir EN/TR olsun. | `backend/dub_verify.py` | PLANLANDI | — |
| P0721 | Dublaj planı metin/hash bağı | Anlam ve sözcük: Özne/nesne/koşul ve anlamlı tekrarın korunmasını gerçek örnekle karşılaştır. | `tools/voxcpm2/dub_plan.py` | PLANLANDI | — |
| P0722 | Dublaj planı metin/hash bağı | Sayı ve birim: Saat, para, yüzde ve işaretli miktarlar hatalı dönüştüğünde açık uyarı; doğru doğal biçim yanlış reddedilmesin. | `tools/voxcpm2/dub_plan.py` | PLANLANDI | — |
| P0723 | Dublaj planı metin/hash bağı | Olumsuzluk ve kip: Negatif/modal anlam kaybını yakala; nominal Türkçe ve temporal before bağlamını yanlış negatif sanma. | `tools/voxcpm2/dub_plan.py` | PLANLANDI | — |
| P0724 | Dublaj planı metin/hash bağı | Komşu bağlam: Kısa replikte önce/sonra bağlam kullanılsın; komşu cümleyi hedefe kopyalama. | `tools/voxcpm2/dub_plan.py` | PLANLANDI | — |
| P0725 | Dublaj planı metin/hash bağı | Konuşmacı sınırı: Farklı konuşmacı veya sahne replikleri anlamı değiştirecek biçimde birleşmesin. | `tools/voxcpm2/dub_plan.py` | PLANLANDI | — |
| P0726 | Dublaj planı metin/hash bağı | Kısmi yanıt: Eksik/boş/dil değiştirmemiş satırı tam çıktı sayma; eksik kimlikler görünür kalsın. | `tools/voxcpm2/dub_plan.py` | PLANLANDI | — |
| P0727 | Dublaj planı metin/hash bağı | İptal ve revizyon: İptalden/kaynak değişiminden sonra geç çeviriyi yeni metne uygulama. | `tools/voxcpm2/dub_plan.py` | PLANLANDI | — |
| P0728 | Dublaj planı metin/hash bağı | Cache ayrımı: Aynı kısa metin farklı bağlam/model/refine ayarında yanlış sonuç paylaşmasın. | `tools/voxcpm2/dub_plan.py` | PLANLANDI | — |
| P0729 | Dublaj planı metin/hash bağı | Süre ve doğal ifade: Süreye sığma isteği anlamı özetlemeye çevrilmesin; KPS ölçümü gerçek ses süresi diye sunulmasın. | `tools/voxcpm2/dub_plan.py` | PLANLANDI | — |
| P0730 | Dublaj planı metin/hash bağı | Unicode ve format: BOM/cp1254/UTF16/Türkçe birleşen karakterlerde içerik ve cue zamanları korunsun. | `tools/voxcpm2/dub_plan.py` | PLANLANDI | — |
| P0731 | Dublaj kaynak ve aralık bağlama | Orijinal eksen: Clip offset cue, kelime ve ses zamanına tam bir kez uygulansın. | `src/renderer/browser-dub-ui.js` | PLANLANDI | — |
| P0732 | Dublaj kaynak ve aralık bağlama | Aralık sınırı: Başlangıç/bitiş kesişiminde içerik kaybolmasın, aralık dışı özgün ses davranışı açık olsun. | `src/renderer/browser-dub-ui.js` | PLANLANDI | — |
| P0733 | Dublaj kaynak ve aralık bağlama | Seek ileri: Yeni zamanda doğru cue/ses/grup bulunur; eski play promise yeni oturumu durdurmasın. | `src/renderer/browser-dub-ui.js` | PLANLANDI | — |
| P0734 | Dublaj kaynak ve aralık bağlama | Seek geri: Daha önce oynatılmış bölgeye dönüşte doğru senkron ve tekrar durumu korunsun. | `src/renderer/browser-dub-ui.js` | PLANLANDI | — |
| P0735 | Dublaj kaynak ve aralık bağlama | Hız değişimi: Süreye sığmayan konuşmada video/ses haritası monoton ve sonlu kalsın. | `src/renderer/browser-dub-ui.js` | PLANLANDI | — |
| P0736 | Dublaj kaynak ve aralık bağlama | Kaynak revizyonu: Başka video/bölüm zaman haritası yeni kaynağa uygulanmasın. | `src/renderer/browser-dub-ui.js` | PLANLANDI | — |
| P0737 | Dublaj kaynak ve aralık bağlama | Son parça: Son ses ve video bitişinde kırpma/taşma/gap açık raporlansın. | `src/renderer/browser-dub-ui.js` | PLANLANDI | — |
| P0738 | Dublaj kaynak ve aralık bağlama | Sessiz boşluk: Konuşmasız aralıklar senkronu kaydırmasın ve sahte ses başarısı sayılmasın. | `src/renderer/browser-dub-ui.js` | PLANLANDI | — |
| P0739 | Dublaj kaynak ve aralık bağlama | Geçersiz zaman: NaN/Infinity/negatif/ters zaman güvenli reddedilsin. | `src/renderer/browser-dub-ui.js` | PLANLANDI | — |
| P0740 | Dublaj kaynak ve aralık bağlama | Kullanıcı kontrolü: Manuel scroll/seek/hız tercihi otomatik takip tarafından istemsiz geri alınmasın. | `src/renderer/browser-dub-ui.js` | PLANLANDI | — |
| P0741 | Ses oynatma oturumu sahipliği | Orijinal eksen: Clip offset cue, kelime ve ses zamanına tam bir kez uygulansın. | `src/renderer/browser-dub-audio.js` | PLANLANDI | — |
| P0742 | Ses oynatma oturumu sahipliği | Aralık sınırı: Başlangıç/bitiş kesişiminde içerik kaybolmasın, aralık dışı özgün ses davranışı açık olsun. | `src/renderer/browser-dub-audio.js` | PLANLANDI | — |
| P0743 | Ses oynatma oturumu sahipliği | Seek ileri: Yeni zamanda doğru cue/ses/grup bulunur; eski play promise yeni oturumu durdurmasın. | `src/renderer/browser-dub-audio.js` | PLANLANDI | — |
| P0744 | Ses oynatma oturumu sahipliği | Seek geri: Daha önce oynatılmış bölgeye dönüşte doğru senkron ve tekrar durumu korunsun. | `src/renderer/browser-dub-audio.js` | PLANLANDI | — |
| P0745 | Ses oynatma oturumu sahipliği | Hız değişimi: Süreye sığmayan konuşmada video/ses haritası monoton ve sonlu kalsın. | `src/renderer/browser-dub-audio.js` | PLANLANDI | — |
| P0746 | Ses oynatma oturumu sahipliği | Kaynak revizyonu: Başka video/bölüm zaman haritası yeni kaynağa uygulanmasın. | `src/renderer/browser-dub-audio.js` | PLANLANDI | — |
| P0747 | Ses oynatma oturumu sahipliği | Son parça: Son ses ve video bitişinde kırpma/taşma/gap açık raporlansın. | `src/renderer/browser-dub-audio.js` | PLANLANDI | — |
| P0748 | Ses oynatma oturumu sahipliği | Sessiz boşluk: Konuşmasız aralıklar senkronu kaydırmasın ve sahte ses başarısı sayılmasın. | `src/renderer/browser-dub-audio.js` | PLANLANDI | — |
| P0749 | Ses oynatma oturumu sahipliği | Geçersiz zaman: NaN/Infinity/negatif/ters zaman güvenli reddedilsin. | `src/renderer/browser-dub-audio.js` | PLANLANDI | — |
| P0750 | Ses oynatma oturumu sahipliği | Kullanıcı kontrolü: Manuel scroll/seek/hız tercihi otomatik takip tarafından istemsiz geri alınmasın. | `src/renderer/browser-dub-audio.js` | PLANLANDI | — |
| P0751 | Ses grubu karşılaştırma ve yeniden üretim | Tam çıktı: Geçerli ses ve tam grup kanıtında gerçek durum ilerlesin; doğal ses kalitesi iddiası üretme. | `src/renderer/dub-generator-ui.js` | PLANLANDI | — |
| P0752 | Ses grubu karşılaştırma ve yeniden üretim | Eksik son grup: Son grubu kontrollü düşür; önceki geçerli parçalar ve eksik grup kimliği korunsun. | `src/renderer/dub-generator-ui.js` | PLANLANDI | — |
| P0753 | Ses grubu karşılaştırma ve yeniden üretim | İptal sınırı: Çalışan alt süreci iptal et; close olmadan sahipliği bırakma. | `src/renderer/dub-generator-ui.js` | PLANLANDI | — |
| P0754 | Ses grubu karşılaştırma ve yeniden üretim | Referans değişimi: Aynı metinde referans dalgasını değiştir; eski ses/latent yanlış yeniden kullanılmasın. | `src/renderer/dub-generator-ui.js` | PLANLANDI | — |
| P0755 | Ses grubu karşılaştırma ve yeniden üretim | Ayar değişimi: Adım/CFG/gruplama değişiminin ilgili cache ve plan kimliğine etkisini denetle. | `src/renderer/dub-generator-ui.js` | PLANLANDI | — |
| P0756 | Ses grubu karşılaştırma ve yeniden üretim | Süre uyuşmazlığı: Uzun konuşmayı kısa pencereye koy; kesme/yavaşlatma modu açık, sözcük kaybı gizlenmesin. | `src/renderer/dub-generator-ui.js` | PLANLANDI | — |
| P0757 | Ses grubu karşılaştırma ve yeniden üretim | Bozuk ses: Boş/kesik/yanlış format sesi başarı veya karşılaştırılabilir çıktı sayma. | `src/renderer/dub-generator-ui.js` | PLANLANDI | — |
| P0758 | Ses grubu karşılaştırma ve yeniden üretim | Kaynak bağı: Başka video veya bölüm çıktısını yeni kaynağa otomatik bağlama. | `src/renderer/dub-generator-ui.js` | PLANLANDI | — |
| P0759 | Ses grubu karşılaştırma ve yeniden üretim | Sınırlı tekrar: OOM/timeout için sonlu retry; terminal hata kullanıcının referansını gereksiz değişmeye zorlamasın. | `src/renderer/dub-generator-ui.js` | PLANLANDI | — |
| P0760 | Ses grubu karşılaştırma ve yeniden üretim | Durum/kanıt: Hazırlık/üretim/doğrulama süreleri ve gerçek kalite durumu ayrı, erişilebilir EN/TR olsun. | `src/renderer/dub-generator-ui.js` | PLANLANDI | — |
| P0761 | Kitap bölüm yakalama ve üretim | Özgün kimlik: Aynı kitapta bölüm/spine veya PDF özgün sayfa kimliği korunur. | `src/media-workflows.js` | PLANLANDI | — |
| P0762 | Kitap bölüm yakalama ve üretim | Seçili kapsam: Ara sayfa/bölüm seçimi yalnız o kapsamı üretir; tam kitap zorunlu olmaz. | `src/media-workflows.js` | PLANLANDI | — |
| P0763 | Kitap bölüm yakalama ve üretim | Metin düzenlemesi: Üretim sürerken metni değiştir; eski sesi yeni metne onaylama. | `src/media-workflows.js` | PLANLANDI | — |
| P0764 | Kitap bölüm yakalama ve üretim | Kaynak değişimi: Dosya dışarıdan değişince önceki kullanıcı düzenlemesini kaybetme ve yeni kaynağı karıştırma. | `src/media-workflows.js` | PLANLANDI | — |
| P0765 | Kitap bölüm yakalama ve üretim | Boş/bozuk bölüm: Boş metin veya geçersiz sayfa aralığını anlaşılır reddet; diğer bölümler korunsun. | `src/media-workflows.js` | PLANLANDI | — |
| P0766 | Kitap bölüm yakalama ve üretim | Kısmi kalite: Eksik/inceleme gruplarını tam doğrulanmış bölüm gibi sunma. | `src/media-workflows.js` | DÜZELTİLDİ | 69b0fff79505339da80870a18984b58f7a2fb297: qualityIncomplete/unavailable ready subset tam chapter ready olamaz; full review ve retryWholeChapter güncelplan tümgrup. İki kırmızı repro sonrası19Node+nativeEN/TRexit0. |
| P0767 | Kitap bölüm yakalama ve üretim | Tek bölüm onarımı: Bir bölüm/grup yeniden üretilirken diğer ses denemeleri ve kullanıcı seçimi korunsun. | `src/media-workflows.js` | DÜZELTİLDİ | 69b0fff79505339da80870a18984b58f7a2fb297: qualityIncomplete/unavailable ready subset tam chapter ready olamaz; full review ve retryWholeChapter güncelplan tümgrup. İki kırmızı repro sonrası19Node+nativeEN/TRexit0. |
| P0768 | Kitap bölüm yakalama ve üretim | Ses konumu: Dinleme/seek/yer imi eski çıktı değişince doğru yeni ses veya açık uyuşmazlık durumuna bağlansın. | `src/media-workflows.js` | PLANLANDI | — |
| P0769 | Kitap bölüm yakalama ve üretim | Büyük kitap: Uzun metin/büyük bölüm sayısında çalışma sınırı açık ve iptal/UI erişimi korunmuş olsun. | `src/media-workflows.js` | PLANLANDI | — |
| P0770 | Kitap bölüm yakalama ve üretim | Okuma yüzeyi: Dar/geniş EN/TR ve açık/koyu temada okuma, üretim ve hata düğmeleri erişilsin. | `src/media-workflows.js` | İNCELENDİ | electron-book-quality636 native1280×900ENdark ve800×760TRlight; tam bölüm kalite uyarısı görünür konuma getirilip iki PNG elle incelendi. Tüm okuma ekranları iddiası yok. |
| P0771 | Kitap ses denemesi geçmişi | Özgün kimlik: Aynı kitapta bölüm/spine veya PDF özgün sayfa kimliği korunur. | `src/book-voice-takes.js` | PLANLANDI | — |
| P0772 | Kitap ses denemesi geçmişi | Seçili kapsam: Ara sayfa/bölüm seçimi yalnız o kapsamı üretir; tam kitap zorunlu olmaz. | `src/book-voice-takes.js` | PLANLANDI | — |
| P0773 | Kitap ses denemesi geçmişi | Metin düzenlemesi: Üretim sürerken metni değiştir; eski sesi yeni metne onaylama. | `src/book-voice-takes.js` | İNCELENDİ | book-voice-takes gerçek persistence testi: önceki take korunur, eski text/diskhash ve aktif üretim reddi; bu paket19Node içinde. |
| P0774 | Kitap ses denemesi geçmişi | Kaynak değişimi: Dosya dışarıdan değişince önceki kullanıcı düzenlemesini kaybetme ve yeni kaynağı karıştırma. | `src/book-voice-takes.js` | PLANLANDI | — |
| P0775 | Kitap ses denemesi geçmişi | Boş/bozuk bölüm: Boş metin veya geçersiz sayfa aralığını anlaşılır reddet; diğer bölümler korunsun. | `src/book-voice-takes.js` | PLANLANDI | — |
| P0776 | Kitap ses denemesi geçmişi | Kısmi kalite: Eksik/inceleme gruplarını tam doğrulanmış bölüm gibi sunma. | `src/book-voice-takes.js` | PLANLANDI | — |
| P0777 | Kitap ses denemesi geçmişi | Tek bölüm onarımı: Bir bölüm/grup yeniden üretilirken diğer ses denemeleri ve kullanıcı seçimi korunsun. | `src/book-voice-takes.js` | İNCELENDİ | book-voice-takes gerçek persistence testi: önceki take korunur, eski text/diskhash ve aktif üretim reddi; bu paket19Node içinde. |
| P0778 | Kitap ses denemesi geçmişi | Ses konumu: Dinleme/seek/yer imi eski çıktı değişince doğru yeni ses veya açık uyuşmazlık durumuna bağlansın. | `src/book-voice-takes.js` | PLANLANDI | — |
| P0779 | Kitap ses denemesi geçmişi | Büyük kitap: Uzun metin/büyük bölüm sayısında çalışma sınırı açık ve iptal/UI erişimi korunmuş olsun. | `src/book-voice-takes.js` | PLANLANDI | — |
| P0780 | Kitap ses denemesi geçmişi | Okuma yüzeyi: Dar/geniş EN/TR ve açık/koyu temada okuma, üretim ve hata düğmeleri erişilsin. | `src/book-voice-takes.js` | PLANLANDI | — |
| P0781 | Kitap üretim planı karşılaştırması | Özgün kimlik: Aynı kitapta bölüm/spine veya PDF özgün sayfa kimliği korunur. | `src/book-production-plan.js` | PLANLANDI | — |
| P0782 | Kitap üretim planı karşılaştırması | Seçili kapsam: Ara sayfa/bölüm seçimi yalnız o kapsamı üretir; tam kitap zorunlu olmaz. | `src/book-production-plan.js` | PLANLANDI | — |
| P0783 | Kitap üretim planı karşılaştırması | Metin düzenlemesi: Üretim sürerken metni değiştir; eski sesi yeni metne onaylama. | `src/book-production-plan.js` | PLANLANDI | — |
| P0784 | Kitap üretim planı karşılaştırması | Kaynak değişimi: Dosya dışarıdan değişince önceki kullanıcı düzenlemesini kaybetme ve yeni kaynağı karıştırma. | `src/book-production-plan.js` | PLANLANDI | — |
| P0785 | Kitap üretim planı karşılaştırması | Boş/bozuk bölüm: Boş metin veya geçersiz sayfa aralığını anlaşılır reddet; diğer bölümler korunsun. | `src/book-production-plan.js` | PLANLANDI | — |
| P0786 | Kitap üretim planı karşılaştırması | Kısmi kalite: Eksik/inceleme gruplarını tam doğrulanmış bölüm gibi sunma. | `src/book-production-plan.js` | PLANLANDI | — |
| P0787 | Kitap üretim planı karşılaştırması | Tek bölüm onarımı: Bir bölüm/grup yeniden üretilirken diğer ses denemeleri ve kullanıcı seçimi korunsun. | `src/book-production-plan.js` | PLANLANDI | — |
| P0788 | Kitap üretim planı karşılaştırması | Ses konumu: Dinleme/seek/yer imi eski çıktı değişince doğru yeni ses veya açık uyuşmazlık durumuna bağlansın. | `src/book-production-plan.js` | PLANLANDI | — |
| P0789 | Kitap üretim planı karşılaştırması | Büyük kitap: Uzun metin/büyük bölüm sayısında çalışma sınırı açık ve iptal/UI erişimi korunmuş olsun. | `src/book-production-plan.js` | PLANLANDI | — |
| P0790 | Kitap üretim planı karşılaştırması | Okuma yüzeyi: Dar/geniş EN/TR ve açık/koyu temada okuma, üretim ve hata düğmeleri erişilsin. | `src/book-production-plan.js` | PLANLANDI | — |
| P0791 | Kitap satır sonu metin hazırlama | Özgün kimlik: Aynı kitapta bölüm/spine veya PDF özgün sayfa kimliği korunur. | `src/book-text-preparation.js` | PLANLANDI | — |
| P0792 | Kitap satır sonu metin hazırlama | Seçili kapsam: Ara sayfa/bölüm seçimi yalnız o kapsamı üretir; tam kitap zorunlu olmaz. | `src/book-text-preparation.js` | PLANLANDI | — |
| P0793 | Kitap satır sonu metin hazırlama | Metin düzenlemesi: Üretim sürerken metni değiştir; eski sesi yeni metne onaylama. | `src/book-text-preparation.js` | PLANLANDI | — |
| P0794 | Kitap satır sonu metin hazırlama | Kaynak değişimi: Dosya dışarıdan değişince önceki kullanıcı düzenlemesini kaybetme ve yeni kaynağı karıştırma. | `src/book-text-preparation.js` | PLANLANDI | — |
| P0795 | Kitap satır sonu metin hazırlama | Boş/bozuk bölüm: Boş metin veya geçersiz sayfa aralığını anlaşılır reddet; diğer bölümler korunsun. | `src/book-text-preparation.js` | PLANLANDI | — |
| P0796 | Kitap satır sonu metin hazırlama | Kısmi kalite: Eksik/inceleme gruplarını tam doğrulanmış bölüm gibi sunma. | `src/book-text-preparation.js` | PLANLANDI | — |
| P0797 | Kitap satır sonu metin hazırlama | Tek bölüm onarımı: Bir bölüm/grup yeniden üretilirken diğer ses denemeleri ve kullanıcı seçimi korunsun. | `src/book-text-preparation.js` | PLANLANDI | — |
| P0798 | Kitap satır sonu metin hazırlama | Ses konumu: Dinleme/seek/yer imi eski çıktı değişince doğru yeni ses veya açık uyuşmazlık durumuna bağlansın. | `src/book-text-preparation.js` | PLANLANDI | — |
| P0799 | Kitap satır sonu metin hazırlama | Büyük kitap: Uzun metin/büyük bölüm sayısında çalışma sınırı açık ve iptal/UI erişimi korunmuş olsun. | `src/book-text-preparation.js` | PLANLANDI | — |
| P0800 | Kitap satır sonu metin hazırlama | Okuma yüzeyi: Dar/geniş EN/TR ve açık/koyu temada okuma, üretim ve hata düğmeleri erişilsin. | `src/book-text-preparation.js` | PLANLANDI | — |
| P0801 | Kitap yer imi kaynak eşleme | Özgün kimlik: Aynı kitapta bölüm/spine veya PDF özgün sayfa kimliği korunur. | `src/book-bookmarks.js` | PLANLANDI | — |
| P0802 | Kitap yer imi kaynak eşleme | Seçili kapsam: Ara sayfa/bölüm seçimi yalnız o kapsamı üretir; tam kitap zorunlu olmaz. | `src/book-bookmarks.js` | PLANLANDI | — |
| P0803 | Kitap yer imi kaynak eşleme | Metin düzenlemesi: Üretim sürerken metni değiştir; eski sesi yeni metne onaylama. | `src/book-bookmarks.js` | PLANLANDI | — |
| P0804 | Kitap yer imi kaynak eşleme | Kaynak değişimi: Dosya dışarıdan değişince önceki kullanıcı düzenlemesini kaybetme ve yeni kaynağı karıştırma. | `src/book-bookmarks.js` | PLANLANDI | — |
| P0805 | Kitap yer imi kaynak eşleme | Boş/bozuk bölüm: Boş metin veya geçersiz sayfa aralığını anlaşılır reddet; diğer bölümler korunsun. | `src/book-bookmarks.js` | PLANLANDI | — |
| P0806 | Kitap yer imi kaynak eşleme | Kısmi kalite: Eksik/inceleme gruplarını tam doğrulanmış bölüm gibi sunma. | `src/book-bookmarks.js` | PLANLANDI | — |
| P0807 | Kitap yer imi kaynak eşleme | Tek bölüm onarımı: Bir bölüm/grup yeniden üretilirken diğer ses denemeleri ve kullanıcı seçimi korunsun. | `src/book-bookmarks.js` | PLANLANDI | — |
| P0808 | Kitap yer imi kaynak eşleme | Ses konumu: Dinleme/seek/yer imi eski çıktı değişince doğru yeni ses veya açık uyuşmazlık durumuna bağlansın. | `src/book-bookmarks.js` | PLANLANDI | — |
| P0809 | Kitap yer imi kaynak eşleme | Büyük kitap: Uzun metin/büyük bölüm sayısında çalışma sınırı açık ve iptal/UI erişimi korunmuş olsun. | `src/book-bookmarks.js` | PLANLANDI | — |
| P0810 | Kitap yer imi kaynak eşleme | Okuma yüzeyi: Dar/geniş EN/TR ve açık/koyu temada okuma, üretim ve hata düğmeleri erişilsin. | `src/book-bookmarks.js` | PLANLANDI | — |
| P0811 | EPUB spine ve özgün PDF sayfası | Özgün kimlik: Aynı kitapta bölüm/spine veya PDF özgün sayfa kimliği korunur. | `src/book-chapter-link.js` | PLANLANDI | — |
| P0812 | EPUB spine ve özgün PDF sayfası | Seçili kapsam: Ara sayfa/bölüm seçimi yalnız o kapsamı üretir; tam kitap zorunlu olmaz. | `src/book-chapter-link.js` | PLANLANDI | — |
| P0813 | EPUB spine ve özgün PDF sayfası | Metin düzenlemesi: Üretim sürerken metni değiştir; eski sesi yeni metne onaylama. | `src/book-chapter-link.js` | PLANLANDI | — |
| P0814 | EPUB spine ve özgün PDF sayfası | Kaynak değişimi: Dosya dışarıdan değişince önceki kullanıcı düzenlemesini kaybetme ve yeni kaynağı karıştırma. | `src/book-chapter-link.js` | PLANLANDI | — |
| P0815 | EPUB spine ve özgün PDF sayfası | Boş/bozuk bölüm: Boş metin veya geçersiz sayfa aralığını anlaşılır reddet; diğer bölümler korunsun. | `src/book-chapter-link.js` | PLANLANDI | — |
| P0816 | EPUB spine ve özgün PDF sayfası | Kısmi kalite: Eksik/inceleme gruplarını tam doğrulanmış bölüm gibi sunma. | `src/book-chapter-link.js` | PLANLANDI | — |
| P0817 | EPUB spine ve özgün PDF sayfası | Tek bölüm onarımı: Bir bölüm/grup yeniden üretilirken diğer ses denemeleri ve kullanıcı seçimi korunsun. | `src/book-chapter-link.js` | PLANLANDI | — |
| P0818 | EPUB spine ve özgün PDF sayfası | Ses konumu: Dinleme/seek/yer imi eski çıktı değişince doğru yeni ses veya açık uyuşmazlık durumuna bağlansın. | `src/book-chapter-link.js` | PLANLANDI | — |
| P0819 | EPUB spine ve özgün PDF sayfası | Büyük kitap: Uzun metin/büyük bölüm sayısında çalışma sınırı açık ve iptal/UI erişimi korunmuş olsun. | `src/book-chapter-link.js` | PLANLANDI | — |
| P0820 | EPUB spine ve özgün PDF sayfası | Okuma yüzeyi: Dar/geniş EN/TR ve açık/koyu temada okuma, üretim ve hata düğmeleri erişilsin. | `src/book-chapter-link.js` | PLANLANDI | — |
| P0821 | Sesli kitap M4B concat girdisi | Özgün kimlik: Aynı kitapta bölüm/spine veya PDF özgün sayfa kimliği korunur. | `src/book-export-inputs.js` | PLANLANDI | — |
| P0822 | Sesli kitap M4B concat girdisi | Seçili kapsam: Ara sayfa/bölüm seçimi yalnız o kapsamı üretir; tam kitap zorunlu olmaz. | `src/book-export-inputs.js` | PLANLANDI | — |
| P0823 | Sesli kitap M4B concat girdisi | Metin düzenlemesi: Üretim sürerken metni değiştir; eski sesi yeni metne onaylama. | `src/book-export-inputs.js` | PLANLANDI | — |
| P0824 | Sesli kitap M4B concat girdisi | Kaynak değişimi: Dosya dışarıdan değişince önceki kullanıcı düzenlemesini kaybetme ve yeni kaynağı karıştırma. | `src/book-export-inputs.js` | PLANLANDI | — |
| P0825 | Sesli kitap M4B concat girdisi | Boş/bozuk bölüm: Boş metin veya geçersiz sayfa aralığını anlaşılır reddet; diğer bölümler korunsun. | `src/book-export-inputs.js` | PLANLANDI | — |
| P0826 | Sesli kitap M4B concat girdisi | Kısmi kalite: Eksik/inceleme gruplarını tam doğrulanmış bölüm gibi sunma. | `src/book-export-inputs.js` | PLANLANDI | — |
| P0827 | Sesli kitap M4B concat girdisi | Tek bölüm onarımı: Bir bölüm/grup yeniden üretilirken diğer ses denemeleri ve kullanıcı seçimi korunsun. | `src/book-export-inputs.js` | PLANLANDI | — |
| P0828 | Sesli kitap M4B concat girdisi | Ses konumu: Dinleme/seek/yer imi eski çıktı değişince doğru yeni ses veya açık uyuşmazlık durumuna bağlansın. | `src/book-export-inputs.js` | PLANLANDI | — |
| P0829 | Sesli kitap M4B concat girdisi | Büyük kitap: Uzun metin/büyük bölüm sayısında çalışma sınırı açık ve iptal/UI erişimi korunmuş olsun. | `src/book-export-inputs.js` | PLANLANDI | — |
| P0830 | Sesli kitap M4B concat girdisi | Okuma yüzeyi: Dar/geniş EN/TR ve açık/koyu temada okuma, üretim ve hata düğmeleri erişilsin. | `src/book-export-inputs.js` | PLANLANDI | — |
| P0831 | Okuyucu ses meta/seek kontrolü | Orijinal eksen: Clip offset cue, kelime ve ses zamanına tam bir kez uygulansın. | `src/reader-audio-control.js` | PLANLANDI | — |
| P0832 | Okuyucu ses meta/seek kontrolü | Aralık sınırı: Başlangıç/bitiş kesişiminde içerik kaybolmasın, aralık dışı özgün ses davranışı açık olsun. | `src/reader-audio-control.js` | PLANLANDI | — |
| P0833 | Okuyucu ses meta/seek kontrolü | Seek ileri: Yeni zamanda doğru cue/ses/grup bulunur; eski play promise yeni oturumu durdurmasın. | `src/reader-audio-control.js` | PLANLANDI | — |
| P0834 | Okuyucu ses meta/seek kontrolü | Seek geri: Daha önce oynatılmış bölgeye dönüşte doğru senkron ve tekrar durumu korunsun. | `src/reader-audio-control.js` | PLANLANDI | — |
| P0835 | Okuyucu ses meta/seek kontrolü | Hız değişimi: Süreye sığmayan konuşmada video/ses haritası monoton ve sonlu kalsın. | `src/reader-audio-control.js` | PLANLANDI | — |
| P0836 | Okuyucu ses meta/seek kontrolü | Kaynak revizyonu: Başka video/bölüm zaman haritası yeni kaynağa uygulanmasın. | `src/reader-audio-control.js` | PLANLANDI | — |
| P0837 | Okuyucu ses meta/seek kontrolü | Son parça: Son ses ve video bitişinde kırpma/taşma/gap açık raporlansın. | `src/reader-audio-control.js` | PLANLANDI | — |
| P0838 | Okuyucu ses meta/seek kontrolü | Sessiz boşluk: Konuşmasız aralıklar senkronu kaydırmasın ve sahte ses başarısı sayılmasın. | `src/reader-audio-control.js` | PLANLANDI | — |
| P0839 | Okuyucu ses meta/seek kontrolü | Geçersiz zaman: NaN/Infinity/negatif/ters zaman güvenli reddedilsin. | `src/reader-audio-control.js` | PLANLANDI | — |
| P0840 | Okuyucu ses meta/seek kontrolü | Kullanıcı kontrolü: Manuel scroll/seek/hız tercihi otomatik takip tarafından istemsiz geri alınmasın. | `src/reader-audio-control.js` | PLANLANDI | — |
| P0841 | PDF özgün metin araması | Özgün kimlik: Aynı kitapta bölüm/spine veya PDF özgün sayfa kimliği korunur. | `src/pdf-text-search.js` | PLANLANDI | — |
| P0842 | PDF özgün metin araması | Seçili kapsam: Ara sayfa/bölüm seçimi yalnız o kapsamı üretir; tam kitap zorunlu olmaz. | `src/pdf-text-search.js` | PLANLANDI | — |
| P0843 | PDF özgün metin araması | Metin düzenlemesi: Üretim sürerken metni değiştir; eski sesi yeni metne onaylama. | `src/pdf-text-search.js` | PLANLANDI | — |
| P0844 | PDF özgün metin araması | Kaynak değişimi: Dosya dışarıdan değişince önceki kullanıcı düzenlemesini kaybetme ve yeni kaynağı karıştırma. | `src/pdf-text-search.js` | PLANLANDI | — |
| P0845 | PDF özgün metin araması | Boş/bozuk bölüm: Boş metin veya geçersiz sayfa aralığını anlaşılır reddet; diğer bölümler korunsun. | `src/pdf-text-search.js` | PLANLANDI | — |
| P0846 | PDF özgün metin araması | Kısmi kalite: Eksik/inceleme gruplarını tam doğrulanmış bölüm gibi sunma. | `src/pdf-text-search.js` | PLANLANDI | — |
| P0847 | PDF özgün metin araması | Tek bölüm onarımı: Bir bölüm/grup yeniden üretilirken diğer ses denemeleri ve kullanıcı seçimi korunsun. | `src/pdf-text-search.js` | PLANLANDI | — |
| P0848 | PDF özgün metin araması | Ses konumu: Dinleme/seek/yer imi eski çıktı değişince doğru yeni ses veya açık uyuşmazlık durumuna bağlansın. | `src/pdf-text-search.js` | PLANLANDI | — |
| P0849 | PDF özgün metin araması | Büyük kitap: Uzun metin/büyük bölüm sayısında çalışma sınırı açık ve iptal/UI erişimi korunmuş olsun. | `src/pdf-text-search.js` | PLANLANDI | — |
| P0850 | PDF özgün metin araması | Okuma yüzeyi: Dar/geniş EN/TR ve açık/koyu temada okuma, üretim ve hata düğmeleri erişilsin. | `src/pdf-text-search.js` | PLANLANDI | — |
| P0851 | PDF konuşulan bölge eşleme | Özgün kimlik: Aynı kitapta bölüm/spine veya PDF özgün sayfa kimliği korunur. | `src/renderer/pdf-spoken-map.js` | PLANLANDI | — |
| P0852 | PDF konuşulan bölge eşleme | Seçili kapsam: Ara sayfa/bölüm seçimi yalnız o kapsamı üretir; tam kitap zorunlu olmaz. | `src/renderer/pdf-spoken-map.js` | PLANLANDI | — |
| P0853 | PDF konuşulan bölge eşleme | Metin düzenlemesi: Üretim sürerken metni değiştir; eski sesi yeni metne onaylama. | `src/renderer/pdf-spoken-map.js` | PLANLANDI | — |
| P0854 | PDF konuşulan bölge eşleme | Kaynak değişimi: Dosya dışarıdan değişince önceki kullanıcı düzenlemesini kaybetme ve yeni kaynağı karıştırma. | `src/renderer/pdf-spoken-map.js` | PLANLANDI | — |
| P0855 | PDF konuşulan bölge eşleme | Boş/bozuk bölüm: Boş metin veya geçersiz sayfa aralığını anlaşılır reddet; diğer bölümler korunsun. | `src/renderer/pdf-spoken-map.js` | PLANLANDI | — |
| P0856 | PDF konuşulan bölge eşleme | Kısmi kalite: Eksik/inceleme gruplarını tam doğrulanmış bölüm gibi sunma. | `src/renderer/pdf-spoken-map.js` | PLANLANDI | — |
| P0857 | PDF konuşulan bölge eşleme | Tek bölüm onarımı: Bir bölüm/grup yeniden üretilirken diğer ses denemeleri ve kullanıcı seçimi korunsun. | `src/renderer/pdf-spoken-map.js` | PLANLANDI | — |
| P0858 | PDF konuşulan bölge eşleme | Ses konumu: Dinleme/seek/yer imi eski çıktı değişince doğru yeni ses veya açık uyuşmazlık durumuna bağlansın. | `src/renderer/pdf-spoken-map.js` | PLANLANDI | — |
| P0859 | PDF konuşulan bölge eşleme | Büyük kitap: Uzun metin/büyük bölüm sayısında çalışma sınırı açık ve iptal/UI erişimi korunmuş olsun. | `src/renderer/pdf-spoken-map.js` | PLANLANDI | — |
| P0860 | PDF konuşulan bölge eşleme | Okuma yüzeyi: Dar/geniş EN/TR ve açık/koyu temada okuma, üretim ve hata düğmeleri erişilsin. | `src/renderer/pdf-spoken-map.js` | PLANLANDI | — |
| P0861 | Cümle çevirisi anlam koruma | Anlam ve sözcük: Özne/nesne/koşul ve anlamlı tekrarın korunmasını gerçek örnekle karşılaştır. | `backend/sentence_translation.py` | PLANLANDI | — |
| P0862 | Cümle çevirisi anlam koruma | Sayı ve birim: Saat, para, yüzde ve işaretli miktarlar hatalı dönüştüğünde açık uyarı; doğru doğal biçim yanlış reddedilmesin. | `backend/sentence_translation.py` | PLANLANDI | — |
| P0863 | Cümle çevirisi anlam koruma | Olumsuzluk ve kip: Negatif/modal anlam kaybını yakala; nominal Türkçe ve temporal before bağlamını yanlış negatif sanma. | `backend/sentence_translation.py` | PLANLANDI | — |
| P0864 | Cümle çevirisi anlam koruma | Komşu bağlam: Kısa replikte önce/sonra bağlam kullanılsın; komşu cümleyi hedefe kopyalama. | `backend/sentence_translation.py` | PLANLANDI | — |
| P0865 | Cümle çevirisi anlam koruma | Konuşmacı sınırı: Farklı konuşmacı veya sahne replikleri anlamı değiştirecek biçimde birleşmesin. | `backend/sentence_translation.py` | PLANLANDI | — |
| P0866 | Cümle çevirisi anlam koruma | Kısmi yanıt: Eksik/boş/dil değiştirmemiş satırı tam çıktı sayma; eksik kimlikler görünür kalsın. | `backend/sentence_translation.py` | PLANLANDI | — |
| P0867 | Cümle çevirisi anlam koruma | İptal ve revizyon: İptalden/kaynak değişiminden sonra geç çeviriyi yeni metne uygulama. | `backend/sentence_translation.py` | PLANLANDI | — |
| P0868 | Cümle çevirisi anlam koruma | Cache ayrımı: Aynı kısa metin farklı bağlam/model/refine ayarında yanlış sonuç paylaşmasın. | `backend/sentence_translation.py` | PLANLANDI | — |
| P0869 | Cümle çevirisi anlam koruma | Süre ve doğal ifade: Süreye sığma isteği anlamı özetlemeye çevrilmesin; KPS ölçümü gerçek ses süresi diye sunulmasın. | `backend/sentence_translation.py` | PLANLANDI | — |
| P0870 | Cümle çevirisi anlam koruma | Unicode ve format: BOM/cp1254/UTF16/Türkçe birleşen karakterlerde içerik ve cue zamanları korunsun. | `backend/sentence_translation.py` | PLANLANDI | — |
| P0871 | Altyazı cümle grubu ve konuşmacı | Anlam ve sözcük: Özne/nesne/koşul ve anlamlı tekrarın korunmasını gerçek örnekle karşılaştır. | `src/subtitle-sentence-layout.js` | PLANLANDI | — |
| P0872 | Altyazı cümle grubu ve konuşmacı | Sayı ve birim: Saat, para, yüzde ve işaretli miktarlar hatalı dönüştüğünde açık uyarı; doğru doğal biçim yanlış reddedilmesin. | `src/subtitle-sentence-layout.js` | PLANLANDI | — |
| P0873 | Altyazı cümle grubu ve konuşmacı | Olumsuzluk ve kip: Negatif/modal anlam kaybını yakala; nominal Türkçe ve temporal before bağlamını yanlış negatif sanma. | `src/subtitle-sentence-layout.js` | PLANLANDI | — |
| P0874 | Altyazı cümle grubu ve konuşmacı | Komşu bağlam: Kısa replikte önce/sonra bağlam kullanılsın; komşu cümleyi hedefe kopyalama. | `src/subtitle-sentence-layout.js` | PLANLANDI | — |
| P0875 | Altyazı cümle grubu ve konuşmacı | Konuşmacı sınırı: Farklı konuşmacı veya sahne replikleri anlamı değiştirecek biçimde birleşmesin. | `src/subtitle-sentence-layout.js` | PLANLANDI | — |
| P0876 | Altyazı cümle grubu ve konuşmacı | Kısmi yanıt: Eksik/boş/dil değiştirmemiş satırı tam çıktı sayma; eksik kimlikler görünür kalsın. | `src/subtitle-sentence-layout.js` | PLANLANDI | — |
| P0877 | Altyazı cümle grubu ve konuşmacı | İptal ve revizyon: İptalden/kaynak değişiminden sonra geç çeviriyi yeni metne uygulama. | `src/subtitle-sentence-layout.js` | PLANLANDI | — |
| P0878 | Altyazı cümle grubu ve konuşmacı | Cache ayrımı: Aynı kısa metin farklı bağlam/model/refine ayarında yanlış sonuç paylaşmasın. | `src/subtitle-sentence-layout.js` | PLANLANDI | — |
| P0879 | Altyazı cümle grubu ve konuşmacı | Süre ve doğal ifade: Süreye sığma isteği anlamı özetlemeye çevrilmesin; KPS ölçümü gerçek ses süresi diye sunulmasın. | `src/subtitle-sentence-layout.js` | PLANLANDI | — |
| P0880 | Altyazı cümle grubu ve konuşmacı | Unicode ve format: BOM/cp1254/UTF16/Türkçe birleşen karakterlerde içerik ve cue zamanları korunsun. | `src/subtitle-sentence-layout.js` | PLANLANDI | — |
| P0881 | Whisper bölme/offset/çıktı | Orijinal eksen: Clip offset cue, kelime ve ses zamanına tam bir kez uygulansın. | `backend/transcribe.py` | PLANLANDI | — |
| P0882 | Whisper bölme/offset/çıktı | Aralık sınırı: Başlangıç/bitiş kesişiminde içerik kaybolmasın, aralık dışı özgün ses davranışı açık olsun. | `backend/transcribe.py` | PLANLANDI | — |
| P0883 | Whisper bölme/offset/çıktı | Seek ileri: Yeni zamanda doğru cue/ses/grup bulunur; eski play promise yeni oturumu durdurmasın. | `backend/transcribe.py` | PLANLANDI | — |
| P0884 | Whisper bölme/offset/çıktı | Seek geri: Daha önce oynatılmış bölgeye dönüşte doğru senkron ve tekrar durumu korunsun. | `backend/transcribe.py` | PLANLANDI | — |
| P0885 | Whisper bölme/offset/çıktı | Hız değişimi: Süreye sığmayan konuşmada video/ses haritası monoton ve sonlu kalsın. | `backend/transcribe.py` | PLANLANDI | — |
| P0886 | Whisper bölme/offset/çıktı | Kaynak revizyonu: Başka video/bölüm zaman haritası yeni kaynağa uygulanmasın. | `backend/transcribe.py` | PLANLANDI | — |
| P0887 | Whisper bölme/offset/çıktı | Son parça: Son ses ve video bitişinde kırpma/taşma/gap açık raporlansın. | `backend/transcribe.py` | PLANLANDI | — |
| P0888 | Whisper bölme/offset/çıktı | Sessiz boşluk: Konuşmasız aralıklar senkronu kaydırmasın ve sahte ses başarısı sayılmasın. | `backend/transcribe.py` | PLANLANDI | — |
| P0889 | Whisper bölme/offset/çıktı | Geçersiz zaman: NaN/Infinity/negatif/ters zaman güvenli reddedilsin. | `backend/transcribe.py` | PLANLANDI | — |
| P0890 | Whisper bölme/offset/çıktı | Kullanıcı kontrolü: Manuel scroll/seek/hız tercihi otomatik takip tarafından istemsiz geri alınmasın. | `backend/transcribe.py` | PLANLANDI | — |
| P0891 | Çeviri cache bağlamı | Anlam ve sözcük: Özne/nesne/koşul ve anlamlı tekrarın korunmasını gerçek örnekle karşılaştır. | `src/browser-translation-cache.js` | PLANLANDI | — |
| P0892 | Çeviri cache bağlamı | Sayı ve birim: Saat, para, yüzde ve işaretli miktarlar hatalı dönüştüğünde açık uyarı; doğru doğal biçim yanlış reddedilmesin. | `src/browser-translation-cache.js` | PLANLANDI | — |
| P0893 | Çeviri cache bağlamı | Olumsuzluk ve kip: Negatif/modal anlam kaybını yakala; nominal Türkçe ve temporal before bağlamını yanlış negatif sanma. | `src/browser-translation-cache.js` | PLANLANDI | — |
| P0894 | Çeviri cache bağlamı | Komşu bağlam: Kısa replikte önce/sonra bağlam kullanılsın; komşu cümleyi hedefe kopyalama. | `src/browser-translation-cache.js` | PLANLANDI | — |
| P0895 | Çeviri cache bağlamı | Konuşmacı sınırı: Farklı konuşmacı veya sahne replikleri anlamı değiştirecek biçimde birleşmesin. | `src/browser-translation-cache.js` | PLANLANDI | — |
| P0896 | Çeviri cache bağlamı | Kısmi yanıt: Eksik/boş/dil değiştirmemiş satırı tam çıktı sayma; eksik kimlikler görünür kalsın. | `src/browser-translation-cache.js` | PLANLANDI | — |
| P0897 | Çeviri cache bağlamı | İptal ve revizyon: İptalden/kaynak değişiminden sonra geç çeviriyi yeni metne uygulama. | `src/browser-translation-cache.js` | PLANLANDI | — |
| P0898 | Çeviri cache bağlamı | Cache ayrımı: Aynı kısa metin farklı bağlam/model/refine ayarında yanlış sonuç paylaşmasın. | `src/browser-translation-cache.js` | PLANLANDI | — |
| P0899 | Çeviri cache bağlamı | Süre ve doğal ifade: Süreye sığma isteği anlamı özetlemeye çevrilmesin; KPS ölçümü gerçek ses süresi diye sunulmasın. | `src/browser-translation-cache.js` | PLANLANDI | — |
| P0900 | Çeviri cache bağlamı | Unicode ve format: BOM/cp1254/UTF16/Türkçe birleşen karakterlerde içerik ve cue zamanları korunsun. | `src/browser-translation-cache.js` | PLANLANDI | — |
| P0901 | Çeviri scheduler kaynak revizyonu | Anlam ve sözcük: Özne/nesne/koşul ve anlamlı tekrarın korunmasını gerçek örnekle karşılaştır. | `src/browser-translation-scheduler.js` | PLANLANDI | — |
| P0902 | Çeviri scheduler kaynak revizyonu | Sayı ve birim: Saat, para, yüzde ve işaretli miktarlar hatalı dönüştüğünde açık uyarı; doğru doğal biçim yanlış reddedilmesin. | `src/browser-translation-scheduler.js` | PLANLANDI | — |
| P0903 | Çeviri scheduler kaynak revizyonu | Olumsuzluk ve kip: Negatif/modal anlam kaybını yakala; nominal Türkçe ve temporal before bağlamını yanlış negatif sanma. | `src/browser-translation-scheduler.js` | PLANLANDI | — |
| P0904 | Çeviri scheduler kaynak revizyonu | Komşu bağlam: Kısa replikte önce/sonra bağlam kullanılsın; komşu cümleyi hedefe kopyalama. | `src/browser-translation-scheduler.js` | PLANLANDI | — |
| P0905 | Çeviri scheduler kaynak revizyonu | Konuşmacı sınırı: Farklı konuşmacı veya sahne replikleri anlamı değiştirecek biçimde birleşmesin. | `src/browser-translation-scheduler.js` | PLANLANDI | — |
| P0906 | Çeviri scheduler kaynak revizyonu | Kısmi yanıt: Eksik/boş/dil değiştirmemiş satırı tam çıktı sayma; eksik kimlikler görünür kalsın. | `src/browser-translation-scheduler.js` | PLANLANDI | — |
| P0907 | Çeviri scheduler kaynak revizyonu | İptal ve revizyon: İptalden/kaynak değişiminden sonra geç çeviriyi yeni metne uygulama. | `src/browser-translation-scheduler.js` | PLANLANDI | — |
| P0908 | Çeviri scheduler kaynak revizyonu | Cache ayrımı: Aynı kısa metin farklı bağlam/model/refine ayarında yanlış sonuç paylaşmasın. | `src/browser-translation-scheduler.js` | PLANLANDI | — |
| P0909 | Çeviri scheduler kaynak revizyonu | Süre ve doğal ifade: Süreye sığma isteği anlamı özetlemeye çevrilmesin; KPS ölçümü gerçek ses süresi diye sunulmasın. | `src/browser-translation-scheduler.js` | PLANLANDI | — |
| P0910 | Çeviri scheduler kaynak revizyonu | Unicode ve format: BOM/cp1254/UTF16/Türkçe birleşen karakterlerde içerik ve cue zamanları korunsun. | `src/browser-translation-scheduler.js` | PLANLANDI | — |
| P0911 | Çeviri çıktı bütünlük sözleşmesi | Anlam ve sözcük: Özne/nesne/koşul ve anlamlı tekrarın korunmasını gerçek örnekle karşılaştır. | `src/subtitle-output-contract.js` | PLANLANDI | — |
| P0912 | Çeviri çıktı bütünlük sözleşmesi | Sayı ve birim: Saat, para, yüzde ve işaretli miktarlar hatalı dönüştüğünde açık uyarı; doğru doğal biçim yanlış reddedilmesin. | `src/subtitle-output-contract.js` | PLANLANDI | — |
| P0913 | Çeviri çıktı bütünlük sözleşmesi | Olumsuzluk ve kip: Negatif/modal anlam kaybını yakala; nominal Türkçe ve temporal before bağlamını yanlış negatif sanma. | `src/subtitle-output-contract.js` | PLANLANDI | — |
| P0914 | Çeviri çıktı bütünlük sözleşmesi | Komşu bağlam: Kısa replikte önce/sonra bağlam kullanılsın; komşu cümleyi hedefe kopyalama. | `src/subtitle-output-contract.js` | PLANLANDI | — |
| P0915 | Çeviri çıktı bütünlük sözleşmesi | Konuşmacı sınırı: Farklı konuşmacı veya sahne replikleri anlamı değiştirecek biçimde birleşmesin. | `src/subtitle-output-contract.js` | PLANLANDI | — |
| P0916 | Çeviri çıktı bütünlük sözleşmesi | Kısmi yanıt: Eksik/boş/dil değiştirmemiş satırı tam çıktı sayma; eksik kimlikler görünür kalsın. | `src/subtitle-output-contract.js` | PLANLANDI | — |
| P0917 | Çeviri çıktı bütünlük sözleşmesi | İptal ve revizyon: İptalden/kaynak değişiminden sonra geç çeviriyi yeni metne uygulama. | `src/subtitle-output-contract.js` | PLANLANDI | — |
| P0918 | Çeviri çıktı bütünlük sözleşmesi | Cache ayrımı: Aynı kısa metin farklı bağlam/model/refine ayarında yanlış sonuç paylaşmasın. | `src/subtitle-output-contract.js` | PLANLANDI | — |
| P0919 | Çeviri çıktı bütünlük sözleşmesi | Süre ve doğal ifade: Süreye sığma isteği anlamı özetlemeye çevrilmesin; KPS ölçümü gerçek ses süresi diye sunulmasın. | `src/subtitle-output-contract.js` | PLANLANDI | — |
| P0920 | Çeviri çıktı bütünlük sözleşmesi | Unicode ve format: BOM/cp1254/UTF16/Türkçe birleşen karakterlerde içerik ve cue zamanları korunsun. | `src/subtitle-output-contract.js` | PLANLANDI | — |
| P0921 | Ses metni coverage özeti | Anlam ve sözcük: Özne/nesne/koşul ve anlamlı tekrarın korunmasını gerçek örnekle karşılaştır. | `src/translation-review-summary.js` | PLANLANDI | — |
| P0922 | Ses metni coverage özeti | Sayı ve birim: Saat, para, yüzde ve işaretli miktarlar hatalı dönüştüğünde açık uyarı; doğru doğal biçim yanlış reddedilmesin. | `src/translation-review-summary.js` | PLANLANDI | — |
| P0923 | Ses metni coverage özeti | Olumsuzluk ve kip: Negatif/modal anlam kaybını yakala; nominal Türkçe ve temporal before bağlamını yanlış negatif sanma. | `src/translation-review-summary.js` | PLANLANDI | — |
| P0924 | Ses metni coverage özeti | Komşu bağlam: Kısa replikte önce/sonra bağlam kullanılsın; komşu cümleyi hedefe kopyalama. | `src/translation-review-summary.js` | PLANLANDI | — |
| P0925 | Ses metni coverage özeti | Konuşmacı sınırı: Farklı konuşmacı veya sahne replikleri anlamı değiştirecek biçimde birleşmesin. | `src/translation-review-summary.js` | PLANLANDI | — |
| P0926 | Ses metni coverage özeti | Kısmi yanıt: Eksik/boş/dil değiştirmemiş satırı tam çıktı sayma; eksik kimlikler görünür kalsın. | `src/translation-review-summary.js` | PLANLANDI | — |
| P0927 | Ses metni coverage özeti | İptal ve revizyon: İptalden/kaynak değişiminden sonra geç çeviriyi yeni metne uygulama. | `src/translation-review-summary.js` | PLANLANDI | — |
| P0928 | Ses metni coverage özeti | Cache ayrımı: Aynı kısa metin farklı bağlam/model/refine ayarında yanlış sonuç paylaşmasın. | `src/translation-review-summary.js` | PLANLANDI | — |
| P0929 | Ses metni coverage özeti | Süre ve doğal ifade: Süreye sığma isteği anlamı özetlemeye çevrilmesin; KPS ölçümü gerçek ses süresi diye sunulmasın. | `src/translation-review-summary.js` | PLANLANDI | — |
| P0930 | Ses metni coverage özeti | Unicode ve format: BOM/cp1254/UTF16/Türkçe birleşen karakterlerde içerik ve cue zamanları korunsun. | `src/translation-review-summary.js` | PLANLANDI | — |
| P0931 | Asistan devam tokenı ve exact iş | Kaynak kanıtı: Yalnız seçili sayfa/metin/video kanıtıyla yanıt veya işlem üret. | `src/assistant-flows.js` | PLANLANDI | — |
| P0932 | Asistan devam tokenı ve exact iş | Araç sınırı: Kullanılabilir araç bağlama göre görünür; yok kapasiteyi varmış gibi söyleme. | `src/assistant-flows.js` | PLANLANDI | — |
| P0933 | Asistan devam tokenı ve exact iş | Öneri/uygulama: Read ile proposal/accepted/completed ayrımı açık kalsın. | `src/assistant-flows.js` | PLANLANDI | — |
| P0934 | Asistan devam tokenı ve exact iş | Kaynak revizyonu: Araç/sağlayıcı beklerken sayfa/sekme değişirse eski sonuç yeni bağlama yazılmasın. | `src/assistant-flows.js` | PLANLANDI | — |
| P0935 | Asistan devam tokenı ve exact iş | İptal/deadline: İptal edilen model/araç zinciri sonraki eylemi başlatmasın. | `src/assistant-flows.js` | PLANLANDI | — |
| P0936 | Asistan devam tokenı ve exact iş | Güvenilmeyen metin: Sayfa/altyazı içindeki talimat kullanıcı yetkisine dönüşmesin. | `src/assistant-flows.js` | PLANLANDI | — |
| P0937 | Asistan devam tokenı ve exact iş | Gerçek kimlik: Cue/iş/çıktı kimliği uydurulamaz; kayıtlı tam nesneye bağlansın. | `src/assistant-flows.js` | PLANLANDI | — |
| P0938 | Asistan devam tokenı ve exact iş | Hata ve tekrar: Sağlayıcı/araç hatasında retry güvenli olsun; yapılmış eylem tekrarlanmasın. | `src/assistant-flows.js` | PLANLANDI | — |
| P0939 | Asistan devam tokenı ve exact iş | Büyük bağlam: Kısaltılmış bağlam ve alıntı sınırı açık, kaynak referansları geçerli kalsın. | `src/assistant-flows.js` | PLANLANDI | — |
| P0940 | Asistan devam tokenı ve exact iş | Görünüm ve odak: Dar/geniş EN/TR panelde kart/odak/progress ve durdurma kullanılabilir olsun. | `src/assistant-flows.js` | PLANLANDI | — |
| P0941 | Asistan iş defteri ve iptal | Başlama ve gerçek kimlik: Başlatılan alt iş/süreç kimliğini gerçek kayda bağla. | `src/assistant-jobs.js` | PLANLANDI | — |
| P0942 | Asistan iş defteri ve iptal | Spawn başarısızlığı: Süreç doğmadan hata gelince kilidi bırak ve kullanıcıya anlamlı hata döndür. | `src/assistant-jobs.js` | PLANLANDI | — |
| P0943 | Asistan iş defteri ve iptal | Canlı süreçte error: Kill/send hatasında süreç hâlâ canlıysa sahipliği erken bırakma. | `src/assistant-jobs.js` | PLANLANDI | — |
| P0944 | Asistan iş defteri ve iptal | İptal/close yarışı: İptal sonrası geç done/close ikinci başarı veya başka işin kapatılmasını üretmesin. | `src/assistant-jobs.js` | PLANLANDI | — |
| P0945 | Asistan iş defteri ve iptal | Çıktı sınırı: Uzun stdout/stderr protokolü belleği sınırsız büyütmesin ve yarım satır doğru toplansın. | `src/assistant-jobs.js` | PLANLANDI | — |
| P0946 | Asistan iş defteri ve iptal | Timeout: Sessiz takılmada sonlu zaman sınırı ve doğrulanabilir durdurma sonucu olsun. | `src/assistant-jobs.js` | PLANLANDI | — |
| P0947 | Asistan iş defteri ve iptal | Tekrar başlatma: Önceki süreç kapanmadıysa yeni iş çakışmasın; kapanınca retry mümkün olsun. | `src/assistant-jobs.js` | PLANLANDI | — |
| P0948 | Asistan iş defteri ve iptal | Kaynak değişimi: Bekleyen işlemin sonucu başka sekme/bölüm/ses kaynağına uygulanmasın. | `src/assistant-jobs.js` | PLANLANDI | — |
| P0949 | Asistan iş defteri ve iptal | Gizli veri: İstek argv/log/diagnostic hassas verileri açığa çıkarmasın. | `src/assistant-jobs.js` | PLANLANDI | — |
| P0950 | Asistan iş defteri ve iptal | Windows yolu: Boşluk/apostrof/Türkçe yol ve windowsHide/alt süreç env değişen kapıda korunsun. | `src/assistant-jobs.js` | PLANLANDI | — |
| P0951 | Asistan uygulama eylem köprüsü | Kaynak kanıtı: Yalnız seçili sayfa/metin/video kanıtıyla yanıt veya işlem üret. | `src/renderer/assistant-app-actions.js` | PLANLANDI | — |
| P0952 | Asistan uygulama eylem köprüsü | Araç sınırı: Kullanılabilir araç bağlama göre görünür; yok kapasiteyi varmış gibi söyleme. | `src/renderer/assistant-app-actions.js` | PLANLANDI | — |
| P0953 | Asistan uygulama eylem köprüsü | Öneri/uygulama: Read ile proposal/accepted/completed ayrımı açık kalsın. | `src/renderer/assistant-app-actions.js` | PLANLANDI | — |
| P0954 | Asistan uygulama eylem köprüsü | Kaynak revizyonu: Araç/sağlayıcı beklerken sayfa/sekme değişirse eski sonuç yeni bağlama yazılmasın. | `src/renderer/assistant-app-actions.js` | PLANLANDI | — |
| P0955 | Asistan uygulama eylem köprüsü | İptal/deadline: İptal edilen model/araç zinciri sonraki eylemi başlatmasın. | `src/renderer/assistant-app-actions.js` | PLANLANDI | — |
| P0956 | Asistan uygulama eylem köprüsü | Güvenilmeyen metin: Sayfa/altyazı içindeki talimat kullanıcı yetkisine dönüşmesin. | `src/renderer/assistant-app-actions.js` | PLANLANDI | — |
| P0957 | Asistan uygulama eylem köprüsü | Gerçek kimlik: Cue/iş/çıktı kimliği uydurulamaz; kayıtlı tam nesneye bağlansın. | `src/renderer/assistant-app-actions.js` | PLANLANDI | — |
| P0958 | Asistan uygulama eylem köprüsü | Hata ve tekrar: Sağlayıcı/araç hatasında retry güvenli olsun; yapılmış eylem tekrarlanmasın. | `src/renderer/assistant-app-actions.js` | PLANLANDI | — |
| P0959 | Asistan uygulama eylem köprüsü | Büyük bağlam: Kısaltılmış bağlam ve alıntı sınırı açık, kaynak referansları geçerli kalsın. | `src/renderer/assistant-app-actions.js` | PLANLANDI | — |
| P0960 | Asistan uygulama eylem köprüsü | Görünüm ve odak: Dar/geniş EN/TR panelde kart/odak/progress ve durdurma kullanılabilir olsun. | `src/renderer/assistant-app-actions.js` | PLANLANDI | — |
| P0961 | Asistan güvenilir kaynak manifesti | Kaynak kanıtı: Yalnız seçili sayfa/metin/video kanıtıyla yanıt veya işlem üret. | `src/assistant-context-manifest.js` | PLANLANDI | — |
| P0962 | Asistan güvenilir kaynak manifesti | Araç sınırı: Kullanılabilir araç bağlama göre görünür; yok kapasiteyi varmış gibi söyleme. | `src/assistant-context-manifest.js` | PLANLANDI | — |
| P0963 | Asistan güvenilir kaynak manifesti | Öneri/uygulama: Read ile proposal/accepted/completed ayrımı açık kalsın. | `src/assistant-context-manifest.js` | PLANLANDI | — |
| P0964 | Asistan güvenilir kaynak manifesti | Kaynak revizyonu: Araç/sağlayıcı beklerken sayfa/sekme değişirse eski sonuç yeni bağlama yazılmasın. | `src/assistant-context-manifest.js` | PLANLANDI | — |
| P0965 | Asistan güvenilir kaynak manifesti | İptal/deadline: İptal edilen model/araç zinciri sonraki eylemi başlatmasın. | `src/assistant-context-manifest.js` | PLANLANDI | — |
| P0966 | Asistan güvenilir kaynak manifesti | Güvenilmeyen metin: Sayfa/altyazı içindeki talimat kullanıcı yetkisine dönüşmesin. | `src/assistant-context-manifest.js` | PLANLANDI | — |
| P0967 | Asistan güvenilir kaynak manifesti | Gerçek kimlik: Cue/iş/çıktı kimliği uydurulamaz; kayıtlı tam nesneye bağlansın. | `src/assistant-context-manifest.js` | PLANLANDI | — |
| P0968 | Asistan güvenilir kaynak manifesti | Hata ve tekrar: Sağlayıcı/araç hatasında retry güvenli olsun; yapılmış eylem tekrarlanmasın. | `src/assistant-context-manifest.js` | PLANLANDI | — |
| P0969 | Asistan güvenilir kaynak manifesti | Büyük bağlam: Kısaltılmış bağlam ve alıntı sınırı açık, kaynak referansları geçerli kalsın. | `src/assistant-context-manifest.js` | PLANLANDI | — |
| P0970 | Asistan güvenilir kaynak manifesti | Görünüm ve odak: Dar/geniş EN/TR panelde kart/odak/progress ve durdurma kullanılabilir olsun. | `src/assistant-context-manifest.js` | PLANLANDI | — |
| P0971 | Asistan tool döngüsü | Kaynak kanıtı: Yalnız seçili sayfa/metin/video kanıtıyla yanıt veya işlem üret. | `src/assistant-agent-service.js` | PLANLANDI | — |
| P0972 | Asistan tool döngüsü | Araç sınırı: Kullanılabilir araç bağlama göre görünür; yok kapasiteyi varmış gibi söyleme. | `src/assistant-agent-service.js` | PLANLANDI | — |
| P0973 | Asistan tool döngüsü | Öneri/uygulama: Read ile proposal/accepted/completed ayrımı açık kalsın. | `src/assistant-agent-service.js` | PLANLANDI | — |
| P0974 | Asistan tool döngüsü | Kaynak revizyonu: Araç/sağlayıcı beklerken sayfa/sekme değişirse eski sonuç yeni bağlama yazılmasın. | `src/assistant-agent-service.js` | PLANLANDI | — |
| P0975 | Asistan tool döngüsü | İptal/deadline: İptal edilen model/araç zinciri sonraki eylemi başlatmasın. | `src/assistant-agent-service.js` | PLANLANDI | — |
| P0976 | Asistan tool döngüsü | Güvenilmeyen metin: Sayfa/altyazı içindeki talimat kullanıcı yetkisine dönüşmesin. | `src/assistant-agent-service.js` | PLANLANDI | — |
| P0977 | Asistan tool döngüsü | Gerçek kimlik: Cue/iş/çıktı kimliği uydurulamaz; kayıtlı tam nesneye bağlansın. | `src/assistant-agent-service.js` | PLANLANDI | — |
| P0978 | Asistan tool döngüsü | Hata ve tekrar: Sağlayıcı/araç hatasında retry güvenli olsun; yapılmış eylem tekrarlanmasın. | `src/assistant-agent-service.js` | PLANLANDI | — |
| P0979 | Asistan tool döngüsü | Büyük bağlam: Kısaltılmış bağlam ve alıntı sınırı açık, kaynak referansları geçerli kalsın. | `src/assistant-agent-service.js` | PLANLANDI | — |
| P0980 | Asistan tool döngüsü | Görünüm ve odak: Dar/geniş EN/TR panelde kart/odak/progress ve durdurma kullanılabilir olsun. | `src/assistant-agent-service.js` | PLANLANDI | — |
| P0981 | Canlı ASR ses kaynağı değişimi | Başlama ve gerçek kimlik: Başlatılan alt iş/süreç kimliğini gerçek kayda bağla. | `src/live-asr-audio-switch.js` | PLANLANDI | — |
| P0982 | Canlı ASR ses kaynağı değişimi | Spawn başarısızlığı: Süreç doğmadan hata gelince kilidi bırak ve kullanıcıya anlamlı hata döndür. | `src/live-asr-audio-switch.js` | PLANLANDI | — |
| P0983 | Canlı ASR ses kaynağı değişimi | Canlı süreçte error: Kill/send hatasında süreç hâlâ canlıysa sahipliği erken bırakma. | `src/live-asr-audio-switch.js` | PLANLANDI | — |
| P0984 | Canlı ASR ses kaynağı değişimi | İptal/close yarışı: İptal sonrası geç done/close ikinci başarı veya başka işin kapatılmasını üretmesin. | `src/live-asr-audio-switch.js` | PLANLANDI | — |
| P0985 | Canlı ASR ses kaynağı değişimi | Çıktı sınırı: Uzun stdout/stderr protokolü belleği sınırsız büyütmesin ve yarım satır doğru toplansın. | `src/live-asr-audio-switch.js` | PLANLANDI | — |
| P0986 | Canlı ASR ses kaynağı değişimi | Timeout: Sessiz takılmada sonlu zaman sınırı ve doğrulanabilir durdurma sonucu olsun. | `src/live-asr-audio-switch.js` | PLANLANDI | — |
| P0987 | Canlı ASR ses kaynağı değişimi | Tekrar başlatma: Önceki süreç kapanmadıysa yeni iş çakışmasın; kapanınca retry mümkün olsun. | `src/live-asr-audio-switch.js` | PLANLANDI | — |
| P0988 | Canlı ASR ses kaynağı değişimi | Kaynak değişimi: Bekleyen işlemin sonucu başka sekme/bölüm/ses kaynağına uygulanmasın. | `src/live-asr-audio-switch.js` | PLANLANDI | — |
| P0989 | Canlı ASR ses kaynağı değişimi | Gizli veri: İstek argv/log/diagnostic hassas verileri açığa çıkarmasın. | `src/live-asr-audio-switch.js` | PLANLANDI | — |
| P0990 | Canlı ASR ses kaynağı değişimi | Windows yolu: Boşluk/apostrof/Türkçe yol ve windowsHide/alt süreç env değişen kapıda korunsun. | `src/live-asr-audio-switch.js` | PLANLANDI | — |
| P0991 | Sayfa çevirisi DOM kaynak bağı | Anlam ve sözcük: Özne/nesne/koşul ve anlamlı tekrarın korunmasını gerçek örnekle karşılaştır. | `src/browser-page-translate.js` | PLANLANDI | — |
| P0992 | Sayfa çevirisi DOM kaynak bağı | Sayı ve birim: Saat, para, yüzde ve işaretli miktarlar hatalı dönüştüğünde açık uyarı; doğru doğal biçim yanlış reddedilmesin. | `src/browser-page-translate.js` | PLANLANDI | — |
| P0993 | Sayfa çevirisi DOM kaynak bağı | Olumsuzluk ve kip: Negatif/modal anlam kaybını yakala; nominal Türkçe ve temporal before bağlamını yanlış negatif sanma. | `src/browser-page-translate.js` | PLANLANDI | — |
| P0994 | Sayfa çevirisi DOM kaynak bağı | Komşu bağlam: Kısa replikte önce/sonra bağlam kullanılsın; komşu cümleyi hedefe kopyalama. | `src/browser-page-translate.js` | PLANLANDI | — |
| P0995 | Sayfa çevirisi DOM kaynak bağı | Konuşmacı sınırı: Farklı konuşmacı veya sahne replikleri anlamı değiştirecek biçimde birleşmesin. | `src/browser-page-translate.js` | PLANLANDI | — |
| P0996 | Sayfa çevirisi DOM kaynak bağı | Kısmi yanıt: Eksik/boş/dil değiştirmemiş satırı tam çıktı sayma; eksik kimlikler görünür kalsın. | `src/browser-page-translate.js` | PLANLANDI | — |
| P0997 | Sayfa çevirisi DOM kaynak bağı | İptal ve revizyon: İptalden/kaynak değişiminden sonra geç çeviriyi yeni metne uygulama. | `src/browser-page-translate.js` | PLANLANDI | — |
| P0998 | Sayfa çevirisi DOM kaynak bağı | Cache ayrımı: Aynı kısa metin farklı bağlam/model/refine ayarında yanlış sonuç paylaşmasın. | `src/browser-page-translate.js` | PLANLANDI | — |
| P0999 | Sayfa çevirisi DOM kaynak bağı | Süre ve doğal ifade: Süreye sığma isteği anlamı özetlemeye çevrilmesin; KPS ölçümü gerçek ses süresi diye sunulmasın. | `src/browser-page-translate.js` | PLANLANDI | — |
| P1000 | Sayfa çevirisi DOM kaynak bağı | Unicode ve format: BOM/cp1254/UTF16/Türkçe birleşen karakterlerde içerik ve cue zamanları korunsun. | `src/browser-page-translate.js` | PLANLANDI | — |

İlk kontrol noktası636: 16 hedefe kapsamı sınırlı kanıt eklendi; 984 hedef hâlâ PLANLANDI. Bu sayılar bug sayısı değildir. İki ilişkili kitap kalite/regenerasyon kökü düzeltildi. Çalışma devam ediyor.

Kontrol noktası637: iki ek kabul maddesi düzeltildi, bir erişim maddesi kısmen ilerledi; diğerleri bu paketle bitti sayılmadı. Uzun kimlikler için kalite ve asistan sınırı mevcut üretim kapısıyla2000de uyumlu; geneltool string sınırı200de kalır.
