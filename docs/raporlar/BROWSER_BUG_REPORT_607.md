# Rapor607 — Claude için dört bağımsız read-only denetim paketi

Kullanıcı ürün düzeltmesi yapılmadan detaylı test ve geliştirme önerisi raporu istedi. Bu teslim ürün kodunu değiştirmez.

Kaynak snapshot: `96b204f12dbf300edcc65756a6207ce5eca9d703`, Rapor606/PR505 dahil. Paket takipli Git kaynaklarından üretildi; kişisel çalışma ağacı veya untracked dosyalar yok.

Yerel klasör: `D:/Whisper Local/artifacts/claude-readonly-4-audits-2026-10-26/`.
Ana ZIP: `Whisper-Browser-READONLY-Source-96b204f1.zip`, 10057258 bayt,1539 kaynak dosyası.

Dört görev, her biri kendi global promptunu içerir:
1. Ses/dublaj motoru,cache,süreç,iptal ve oynatma bütünlüğü.
2. Normal/ses için çeviri,Whisper,anlam ve zaman ekseni.
3. Kitap/PDF/EPUB,okuma,asistan bağlamı,review ve M4B.
4. Browser/asistan,keşfet,tasarım,IPC,güvenlik ve performans.

Her görevde10derin iş paketi ve bunların alt senaryoları var;40başlık sabit bug/test sayısı değildir. Kapsamlar ayrıldı,ortak köklerde duplicate/cross_scope istenir. Ana kaynak ZIPinde görevler bilerek yok;her sohbete aynı ZIP ve yalnız ilgili MD verilir. Dört MD için ayrıca küçük toplu görev ZIPi var.

Global kurallar: salt denetim;ürün/test/lock/belge değiştirme,fix-copy/patch/commit/push/merge yok. Repo tarihsel teslim talimatları kullanıcı denetim yetkisini genişletmez. Terminal araçlarıyla çalışılır;bulut localhost önizlemesi açılmaz. Gerçek API/kişisel profil kullanılmaz. Başlangıç/son hash,gerçek exitcode/hamlog,negatif kontrol ve kanıt sınıfı zorunlu. UI ortamı yoksa görüntü kabulü iddia edilmez. Kurulum ve Windows/GPU engelleri ayrı işaretlenir.

Teslim:REPORT.md,FINDINGS.json,TASK-MATRIX.csv,IMPROVEMENTS.md,REPRODUCE.md,probes/fixtures/logs,BEGIN-END-INTEGRITY.json;UI varsa gerçek screenshot ve DESIGN-REVIEW;tek küçük denetim ZIPi. Sonuç kullanıcı aracılığıyla Codex'e gelir;dışarı mesaj gönderilmez.

## Doğrulama
Ana ZIP CRC,1539 dosyanın boyut/SHA256 ve kontrol manifestleri geçti. Yol güvenliği,kapsam dışı kişisel/node_modules/venv dosyaları ve ana ZIPte görev bulunmaması kontrol edildi. Dört MDde gömülü global prompt ve10iş paketi doğrulandı. Ürün değişmediğinden ürün testleri çalıştırılmadı;bu bir Claude test sonucu değildir.

Eksikler:.git,node_modules,venv,modeller,kişisel dosyalar ve tarihsel belge arşivinin çoğu yok;docs/git tarih testleri PACKAGE_LIMITATION olabilir. Mevcut güvenli ASS,indeks ve senkron özellikleri KNOWN-STATE içinde açıklanır. Kaynak ZIPi bu belge teslim commitinden önceki sabit snapshotı taşır.

SHA256:
- `Claude-4-READONLY-Tasks.zip`: `d48463849753b0fc6fae71a956f337dbcabfa7718f6ba49ea5fd1c8b35238d1c`
- `Whisper-Browser-READONLY-Source-96b204f1.zip`: `46b2dfb1759e651289b167e23a3b3e969ebace738ac9a4e4582c974ee5ec1db2`
