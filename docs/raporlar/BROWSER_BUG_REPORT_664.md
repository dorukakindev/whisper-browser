# Rapor 664 — İnternet önizlemelerinde gerçek ses karşılaştırması

Başlangıç master `329f45e3b7863b5e8b80cbcfe24bf45c76cc20a0`; dal `codex/music-preview664`; ürün commit `16540b7965cc3e2860cec03f4f07eecbbfbd7a0c`.

## Teslim edilen davranış

Müzik analizindeki İnternette alanına **Önizlemeleri karşılaştır** eklendi. Kullanıcı yerel referans ve isteğe bağlı aralık seçer; katalogdan kimliği doğrulanmış ilk en fazla sekiz adayın taze önizlemesi okunur. Mevcut CLAP CPU motoru gerçek ses kesitlerini karşılaştırır. Sonuçlar ölçülen kesitlerin zamanları ve benzerlik puanıyla sıralanır. Karşılaştırılmayan veya okunamayan sonuçlar katalog kanıtı olarak kalır; puan uydurulmaz.

A/B, referans ve adayın eşleşen kesitlerini oynatır; RMS seviyesini yalnız kısarak eşleştirir. Önizleme dosyaları ve aday vektörleri yalnız işin geçici dizinindedir; başarı, hata ve iptal sonrasında temizlenir. Yerel referans internete gönderilmez. Kaydet yalnız mevcut katalog metadatasını saklar; geçici URL, ses, vektör ve benzerlik puanı kalıcı listeye yazılmaz.

Asistan `music_action/rank_online` ile kesin `source_id` ve isteğe bağlı eşlenik aralık kullanabilir. `get_music_context` katalog kanıtını `preview-clap` ölçümünden ayırır; puan ve referans/aday kesitleri gösterilir. Modelin kendisi ses dinlemiş gibi konuşması istenmez. İş kabulü tamamlanma değildir.

## Sınırlar ve inceleme onarımları

- Yalnız ana süreçte bilinen 1–8 benzersiz kimlik; renderer URL/dosya yolu seçemez. Önizleme URL'si sabit HTTPS Deezer CDN allowlist'ine uyar, yönlendirme izlenmez. Her önizleme 8 MB, istek 25 saniye ile sınırlı; gövde byte sınırında okunur. Aşımda akış kapatılır. Sinyal iptali her adımda aktarılır.
- FFprobe/FFmpeg önizleme girdisi MP3 olarak zorlanır, yalnız `file,pipe` protokolleri açıktır; decoder'ın URL/playlist izlemesi engellenir. En fazla 30 saniye örneklenir.
- Yerel referans kimliği katalog ID'siyle çakışmaz; yeniden dosya doğrulaması yapılır. Geçici dosyalara renderer erişim izni verilmez; dinlemek için taze sağlayıcı önizlemesi kullanılır.
- A/B referans bitiş kontrolü yalnız A kesiti oynatılırken uygulanır; normal referans oynatma önceki eşleşme sonunda durdurulmaz. Kaynak/katalog değişiminde eski karşılaştırma ve ses seviyesi sıfırlanır.
- İlk native test, asenkron dosya seçimi tamamlanmadan aramayı başlattığı için timeout verdi. Test doğru kaynak yüklenmesini bekleyecek şekilde düzeltildi; eşikler gevşetilmedi. Ürün başarısı diye sayılmadı.

## Kanıt ve kontroller

- 20 hedefli Node kontrolü PASS: music-online, music-analysis, music-similarity, assistant-music, assistant-capabilities, assistant-app-actions. Güvensiz URL, bilinmeyen/tekrar kimlik, byte sınırı, iptal sinyali, geçici sesin renderer'a verilmemesi, model kimliği ve asistan şeması kapsandı.
- `python -m unittest tests/test_music_similarity.py`: 5 PASS. `py_compile backend/music_similarity.py` PASS; 11 değişen/yeni JS sözdizimi ve `git diff --check` PASS.
- Gerçek Windows Electron ayrı test profili: `.uiprev/music664/1793129891193`, PASS. Canlı Deezer 12 kimlik/12 aday, seçilen 8 önizlemenin 8'i indekslendi, 0 başarısız. Gerçek yerel CLAP CPU, A/B oynatma, normal referansın kesilmemesi, iptal sonrası geçici dizin temizliği, asistan kanıt projeksiyonu, metadata kaydetme ve dar ekranda taşma kontrolü geçti. Geniş/dar ekran görüntüleri görsel olarak incelendi; yalnız temiz JSON kanıtı Git'e alındı: [native-result.json](MUSIC_PREVIEWS_2026-10-27/native-result.json).
- Kaynak referansı Librosa'nın CC-BY Kevin MacLeod Vibe Ace fixture'ıdır. Kişisel ses/profil/API anahtarı kullanılmadı. Bu kabul çalışması kör dinleme kalite sıralaması değildir.

## Dosyalar ve devam

`music-online.js`: kimlik snapshot, taze/sınırlı önizleme okuma. `music-analysis-service.js`: iş ve iptal/temizlik. `music-similarity.js` + `backend/music_similarity.py`: mevcut motorun geçici adaylarla kullanımı, decoder sınırı, kimlik izolasyonu. Renderer music-online/analysis UI ve CSS: karşılaştırma, açık kanıt, A/B. Assistant capabilities/actions: yeni kesin kaynak eylemi. Üç hedefli test dosyası + native664 testi.

[Yararlanılan kaynaklar](MUSIC_PREVIEWS_2026-10-27/SOURCES.md). Yeni paket/kurulum/şema/IPC kanalı yok. start.bat/install.bat değiştirilmedi; bu turda üretim start.bat açılışı, GPU/DRM, canlı LLM tool seçimi, tüm ülkeler/sağlayıcılar ve uzun süreli soak çalıştırılmadı. Mevcut 11 before-quit listener uyarısı açık; gizlenmedi. Tam test/CI beklenmedi. Duygu/enstrüman tanıma ve tüm interneti akustik tarama bu teslimde yok.
