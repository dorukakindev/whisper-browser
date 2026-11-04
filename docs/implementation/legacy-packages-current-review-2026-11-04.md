# G3 — Eski paketlerin güncel uygulamayla karşılaştırılması

Taban: PR813 `fd91f0154d446131061653f2dc6a5e0d47ebfb59`. Paketlerdeki talimatlar öneri kabul edildi; güncel kullanıcı ve ürün sahipleri önceliklidir.

| Paket | Alınan / karşılaştırılan | Alınmayan |
|---|---|---|
| files (2).zip / puan-etiket-tür | Ortak score/ratingOf ve Türkçe tür düzeltmesi önceki PR810'da mevcut; kalan künye biçimleri mevcut yardımcılarla hizalanır | Eski tam renderer/yerleşim kopyası |
| Yeni klasör (13) files (2).zip | Eski denetim iddiaları G2'de güncel kodla ayrıldı | Açıkça geçersiz INTERIM yama; bulunmayan nihai patch var sayılmadı |
| whisper-browser-fixes.zip | Seçili altyazı görünürlüğü, sayfa içi seçilen kopyanın yeniden çizimde korunması, opsiyonel görsel yardımcı koruması; uzun adların okunması; RSS çevirisini durdurma ve ikinci isteğe geri bildirim | Eski test fixture/UI ve tam dosya üzerine yazma |
| files (1).zip / podcast kompozisyonu | Gerçek bölüm kimliği/kaynak durumu ile transkript okumasının ayrı hiyerarşisi; mevcut motor/handler/kalıcılık korunur | Örnek bölüm/cue/dock/ilerleme, sahte ölçüm, font/tema üzerine yazma, ikinci ses motoru ve eski onay döngüsü |

Kişisel profil, veriler ve korunan envelope dosyaları değiştirilmez. Görsel/ZIP/fixture/trace dosyaları ürün commitine girmez. Yeni bağımlılık veya hesap yok. Kısa hedefli kontroller; Computer Use, dosya izin penceresi, CPU ve matris yok. Canlı site/model başarısı iddia edilmez.
