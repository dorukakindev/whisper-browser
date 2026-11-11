# Stremio eklentileri

Yerel birleşme ve güncel doğrulama: [2026-11-11-0349](devir/2026-11-11-0349.md). Önceki paket notlarının “yapılmadı” kayıtları tarihsel bağlamdır; gerçek mpv/medya kabulü hâlâ ayrı sınırdır. Kütüphane/puan/geçmiş kapasitesinde eski kişisel kayıtlar sessizce silinmez; yeni kayıt açık kapasite hatası verir. Bozuk kayıt dosyası boş veriyle ezilmez. Puanlar diğer medya havuzlarına sessizce birleştirilmez. Sorgulu manifest adresleri korunur; belirsiz çok dosyalı sezonda başka bölüm seçilmez.

Kullanım: Medya ana sayfası → **Stremio** → **Eklentiler**. Adresi gir (https:// veya stremio://), **Eklentiyi kontrol et**, onaylayınca eklenir. Öneri düğmeleri (Cinemeta, OpenSubtitles v3, Torrentio) yalnız adres kutusunu doldurur.

Akış: bir filme/diziye gir → **Oynat** → eklentilerden kaynaklar gelir (kalite, eklenti, seeder/boyut filtreleri; **En iyi kaynakla oynat**) → seçince oynatıcıda açılır. Keşfet'teki film/dizi sayfalarında IMDb kimliği varsa **Kaynak bul (Stremio)** düğmesi aynı akışı açar.

Oynatıcı alt çubuğundaki menü düğmesi: **Kaynaklar** (konumu koruyarak kaynak değiştir), **Altyazı** (önce altyazı eklentileri, yoksa OpenSubtitles), **Ses** (ses izi / dublaj dosyası ekle), **Yapay zekâ** (altyazıyı çevir, Whisper ile çıkar, tek tık çıkar+çevir, dublaj üret — mevcut düğmeleri tetikler).

Devam: ilerleme kaynaktan bağımsız `stremio-progress.json` içinde tutulur; bölüm bitince sıradaki bölüm önerilir; Stremio sayfasında **İzlemeye devam et** rafı vardır.

## Güvenlik sözleşmesi
- Eklenti adresi gizli sayılır (debrid anahtarı taşıyabilir): yalnız ana süreç dosyasında; renderer yalnız `host/…` etiketini görür. Akış ve altyazı URL'leri renderer'a verilmez; kısa ömürlü oturum jetonlarıyla oynatılır.
- Ağ yalnız main'de: DNS-pinli genel adres kontrolü, elle ve her sıçramada doğrulanan yönlendirme, bayt/süre sınırları. Özel ağ hedefleri yalnız eklentinin kendisi yerel (loopback) ise kabul edilir.
- Torrent kaynakları mevcut rqbit hattından (magnet → dosya seçimi → `whisper-media://`) geçer; motor kurulu değilse oynatma başlamaz ve kurulum için kullanıcıya yönlendirilir.
- `configurationRequired` eklentiler yapılandırılmadan eklenmez. YouTube ve dış bağlantı kaynakları oynatılmaz (neden gösterilir). `proxyHeaders` isteyen kaynaklar yalnız başlıkların tamamı güvenli listedeyse (Referer, Origin, User-Agent, Authorization, Cookie, Accept, Accept-Language, `X-*`) oynatılır; başlıklar ana süreçte kalır ve yalnız seçilen tam adrese eklenir (Chromium: `sessionMux` yuvası `stremio`; native mpv: `http-header-fields`).

## Oynatıcı paneli (altı sekme)
Kaynaklar · Altyazı · Ses · **Oynatma** (hız, ±10 sn/+85 sn atlama, önceki/sonraki bölüm, uyku zamanlayıcı, otomatik sıradaki) · **Dublaj** · Yapay zekâ. Shift+N / Shift+P bölüm değiştirir.

**İçerik profilleri** (Film, Dizi, Belgesel, Animasyon, Video/ders) türden otomatik seçilir, sekmeden değiştirilebilir ve içerik başına saklanır. Profil; çeviri üslubunu (`translateRegister`), dublaj hazır ayarını (Dengeli / Hızlı deneme / Ayrıntılı kontrol), varsayılan hızı ve otomatik sıradaki bölümü belirler. **Dublaj** sekmesi oynatıcıda aktif altyazıyı gösterir (iki altyazı varsa çeviri öncelikli), Whisper / çıkar+çevir kısayolları verir ve stüdyoyu profille birlikte açar. Stremio altyazıları kaydedilirken VTT→SRT'ye çevrilir; dublaj hattı yalnız SRT kabul eder.

Sıradaki bölüm aynı `bingeGroup`/eklenti/kaliteyi tercih eder. Native mpv'de ses/altyazı izi seçilir; bölüm adından (intro/recap/giriş/özet…) atla düğmesi çıkar. MKV/HEVC/HDR veya yerleşik oynatıcı hatasında native öneri gösterilir.

**Listem**: `stremio-library.json` (en çok 500; `.wbp` paketine girmez). Ana sayfa: vitrin, tür çipleri, Listem, devam et, raflar; **Keşfet**: tür/katalog/kategori/puan/yıl/sıralama ve sayfalama; kaynak karşılaştırma (en çok 3).

## Kütüphane, puanlama ve kaynak puanı
**Kütüphane** sekmesi: *Geçmiş* (güne göre gruplu, istatistik: yapım, biten, saat, bu hafta, gün serisi; devam et / sıradaki bölüm / kaldır), *Listem*, *Puanlarım* (durum + puan + not süzgeci). Başlık sayfasında **Benim değerlendirmem**: 10 yıldız, durum (planlıyorum/izliyorum/izledim/bıraktım), not; `stremio-ratings.json` (paketlenmez). Oyuncu/yönetmen/senarist/ödül/ülke eklenti verirse gösterilir. Bölüm satırında "İzlendi işaretle"; sezon hapında ilerleme (S1 · 3/10).

**Kaynak puanı** (0–100): çözünürlük, seeder (log), kaynak türü (remux > Blu-ray > WEB-DL…), ses/HDR, çoklu ses/altyazı, uyumluluk cezası (HEVC/HDR için native), kamera kaydı/az seeder/çok büyük uyarıları. "En yüksek puan" sıralaması ve karşılaştırma tablosunda Puan satırı.

**Oynatıcı Pro** (`src/renderer/player-pro.js`) tüm medya için: görüntü (renk/gama/keskinlik/en-boy/yakınlaştırma/döndürme), altyazı-ses eşitleme, hız, uyku zamanlayıcı, canlı bilgi. Kısayol: X, Q, Z. Ayrıntı: [CODEX-TEST-NOTLARI.md](CODEX-TEST-NOTLARI.md).
