# Rapor744 — Eski stüdyo girişini ortak temaya yönlendirme

Kullanıcının görüntüsündeki Tkinter ekranı R722 ortak Electron stüdyosundan farklıdır. R732/R739 tasarım çalışmaları yeniden yeni özellik sayılmaz. Güncel BAT zaten Electron açıyordu; kalan eski `tools/voxcpm2/text_studio.py` doğrudan çağrısı Tk penceresi açıyordu.

## Değişiklik
- `tools/voxcpm2/text_studio.py` main artık Windows'ta repo içindeki `ses-studyosu.bat` dosyasını `os.startfile` ile açar. Argümanlar shell metnine birleştirilmez. Başsız motorun kullandığı command/defaults işlevleri ve VoxCPM2 ayarları değişmez.
- Eski CLI override'ları sessizce kaybedilmez; açık hata ile arayüzden seçmeye yönlendirilir. Windows dışı girişte uygulama içindeki Text/TXT yolu açıklanır. Eksik launcher hata verir, kötü görünümlü Tk'ya otomatik dönüş yok.
- Tarihsel Tk modülü silinmedi; doğrudan varsayılan girişten çağrılmaz. Başka klasördeki VoxCPM2 arayüzü değiştirilmedi.
- `tests/test_text_studio_launcher.py`: doğru launcher/cwd, sessiz override kaybı olmaması ve Windows dışı açık mesaj.

## Kanıt
3 Python launcher testi ve 2 mevcut text-voice-studio Node testi PASS; diff kontrolü PASS. İzole gerçek Windows Electron `tests/electron-text-voice.smoke.js` exit0; [TR geniş](evidence744/studio-tr-dark.png), [TR dar yüzde125](evidence744/studio-tr-narrow-125.png), [EN açık](evidence744/studio-en-light-settings-125.png). Görseller gerçekten açılıp incelendi. Test gerçek main/preload/renderer kullanır; dosya seçimi sentetik adapterdir. İlk sandbox koşusu SharedDictionary erişim engeliyle çöktü; Windows normal yetkide tekrar PASS. Mevcut 11 before-quit listener uyarısı sürüyor.

## Sınırlar
Bu paket yeni CSS tasarımı değildir; mevcut ortak tasarıma ulaşılmasını onarır. R722/R732/R739 başarıları yeniden bug sayılmaz. Tam BAT kullanıcı etkileşimi, fiziksel dosya seçici, yeni GPU/model üretimi, insan dinleme ve tüm ekranların tasarımı doğrulanmadı. start.bat değişmedi, kişisel uygulama kapatılmadı. Yeni bağımlılık/şema/IPC yok. frontend-design ve make-interfaces-feel-better okundu; mevcut uygulama bileşenleri kullanıldı, dış repo kodu alınmadı. Uzun CI beklenmedi.

Önceden başlayan tools/assistant-deepseek-live.cjs değişikliği bu teslim dışında çalışma ağacında tutuldu. Sentetik live caption denemesinde 5/6 geçti; son hata test adaptörünün list_translation_profiles verisi olmamasından kaynaklandı, ürün bugı diye sayılmadı ve düzeltilmiş/başarılı diye sunulmadı.
