# Rapor 647 — 1000 senaryoluk gece denetimini yayımlama ve tekrar tarama kaydı

2026-10-27 16:54 Europe/Istanbul. Dal codex/product-1000-647, başlangıç HEAD d4cfc7ab4c409a24a058cf650bc179ea6f0e15f2. Ürün kodu değişmedi; bitiş ürün tabanı aynı. Önceki ürün düzeltmesi fe2be80d01ec53cca08db591ac2e26194cddf39c (R646).

Kullanıcı, sonraki denetçilerin aynı çalışmayı yeni keşif diye tekrarlamaması için DeepSeek1000 sonucunu GitHub'a eklemeyi istedi.

## Teslim

[Denetim dizini](../audits/deepseek-night1000-20261027/README.md):1000 satır,50 aile,tekil senaryo imzaları,geçmiş durum ve kanıt bağlantıları. COVERAGE-REGISTRY.json ayrıca yayın-anı üretim dosyası hashlerini ve dört giderilmiş/iki açık gözlemi taşır. Bunlar geçmiş testin kesin revizyonunu ispatlamaz; karma koşu haritası ayrı korunur.

- Okunabilir CSV matrisleri, tarihsel rapor/FINDINGS ve yeniden üretim belgesi açık dosya olarak.
-1059488 byte yayın ZIP'i:2058 girdi,2057 dosya için SHA256 manifesti + manifest; kontrollü test logları,2257 komut kaydı,probe kaynakları ve paket raporları.
- Kaynak arşivine dokunulmadı. İç ZIP/bytecode/orijinal manifest çıkarıldı; snapshot kişisel çalışma ağacı alanları çıkarıldı;4 dosyadaki kullanıcı yolu PUBLIC_USER ile maskelendi. Gerçek profil/görüntü/medya yayımlanmadı. Bilinen anahtar/private-key/token/Bearer imza taraması eşleşme bulmadı; genel güvenlik garantisi değildir.
- AGENTS.md yeni denetim öncesi kayıt okuma kuralı: değişmeyen önceki kontrol yeni bug sayılmaz; kaynak/dependency değişince veya kritik regresyon için yeniden çalıştırılır. CI/test kapatma yok.

## Önemli doğruluk sınırları

843PASS,151NOT_APPLICABLE,5SUSPECTED,1INCONCLUSIVE dış denetimin tarihsel sonuçlarıdır. Kod bu yayın sırasında yeniden1000kez sınanmadı.50×20 mekanizma1000 bağımsız E2E akış değildir. pkg01–06 karma revizyon; kalanlar eski revizyon. F09-01/F09-02'nin matrise bağlanmaması ve9uygulanamaz gerekçesinin prob çıktısı olması saklanır. src/dub-sync-map.js eski task adayı gerçek renderer yolu olarak alias edilir; orijinal görev metni değiştirilmez. Problardaki sabitD yolu ve eski bugbeklentileri README'de açıklanır; otomatik güvenilir sürücü kabul edilmez.

## Kontroller

-1000benzersizID/imza,50aile; CSV/registry durum sayıları eşit.
- ZIPCRC,2057manifest hash/byte boyutu,859kanıt log referansı (eksik0).
- Arşiv/açık dosya6sidecar byte-aynı; SHA256SUMS tüm açık yayın dosyalarını doğruladı.
- Gizli imza taraması ve paket uzantı seçimi; JSON parse.
- docs-index-integrity ve git diff --check (teslim öncesi).

Bu belge/arşiv işidir: ürün testleri/nativeUI/model/GPU/CI koşulmadı; öncekilerin sonuçlarıyla karıştırılmaz. Yeni bağımlılık/kurulum/şema/launcher değişikliği yok. Kişisel ana uygulama kapatılmaz. Kod+belge ayrımı gereği ürün commit'i yok, tek yayın/belge commit'i. Normal push→PR→master→kişisel dosyalar korunarak ana kopya güncelleme.
