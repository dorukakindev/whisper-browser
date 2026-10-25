# 566 — Kitap sesi genel dublajı değiştirmesin

Kitap UI'ı kayıtlı sesi seçerken ve her üretimden önce `useVoiceReference` çağırıyordu; bu global reference/transcript ayarını değiştiriyordu. `dub:start` da kitaptan gelen kalite/iş ayarlarını genel config'e yazıyordu. Ekrandaki referans adı ise global config'ten geldiği için kaydedilmiş kitap sesiyle uyuşmayabiliyordu.

Kayıtlı kitap seçimi yalnız proje preference'ına yazılır; ID üretim isteğinde gönderilir. Servis gerçek referans deposundan ID/WAV/dökümü doğrulayıp yalnız o işte kullanır. Anlatım işleri global config'i değiştirmez. Diğer per-job referenceId kullanımlarında da global reference/transcript korunur. Eksik referans/dökümde sessiz varsayılan fallback yapılmaz. UI kitap sesi adını gösterir; varsayılana dönmek açık seçimdir. Yerel dosya/döküm düğmeleri hâlâ **uygulama varsayılanını** değiştirir, bu kapsam isim/açıklamayla belirtilir ve kaydedilmiş kitap ID'sini silmez. Bu paket yeni yerel referans içe aktarma aracı değildir.

Hedefli4 sonuç geçti: gerçek servis isteğinde kayıtlı WAV/döküm argv'si, genel config byte'larının korunması, eksik ID reddi ve sonraki browser işinde özgün varsayılan; UI generate referans ID'sini taşır ve global apply çağrısı gerektirmez. NativeWindows `.uiprev/book-reliability549-1792904431541` exit0: gerçek kayıtlı seçim/proje preference/ad etiketi, genel referansın değişmemesi, üretim isteğinde ID. Görüntü incelendi. Model sınırında kontrollü cevap; gerçek GPU/TTS kalitesi/liveAPI/kişisel start.bat/CI bu turda doğrulanmadı.

Yeni bağımlılık/kurulum/kalıcı şema yok. Var olan project.voicePreferences.referenceId kullanılır; dub:start isteği bunu artık uygular. N25 açık referans kapsamı kabulü tamam; gerçek GPU'da ses benzerliği karşılaştırması yapılmadı.
