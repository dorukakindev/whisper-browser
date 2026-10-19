# BROWSER_BUG_REPORT_483 — Gönderilen dublaj denetiminin doğrulanması

2026-10-19. Dal codex/browser-audit477; PR454.
Başlangıç HEAD: `2cfdcaae34744b3f51b0e6b5d2717e901c40923b`.
Başlangıç ürün kodu: `349b9df83c3f0087a838a89cb967691e5f52d639`.
Bitiş ürün kodu: `fcbcb42a5adfb85396e4278306a77bb306e91e03`.
Ara ses kodu: `76ef3d1d86940358ac41382f46438ad777cfc52d`.

Kullanıcı yapıştırılan dublaj denetimine bakılmasını istedi. İddialar
çalışan ana süreç doğrulaması kabul edilmedi; mevcut kod ve kontrollü
örneklerle karşılaştırıldı. Ana checkout'taki B1/B2 kod/test değişiklikleri
ve yeni test_dub_module_paths.py korunup inceleme dalına üç-yollu alındı.
B1/B2 başkasınca hazırlanmış düzeltmelerdir; bu turda yeni bulunmuş sayılmaz.

| İddia | Sonuç / uygulama |
|---|---|
| B1 modül gölgelenmesi | Doğrulandı; yerel ROOT motor klasöründen önce ve tekil. Kullanıcının mevcut düzeltmesi korundu; AST ile gerçek sys.path bloğu testi geçti. |
| B2/D2 hata görünmezliği | Doğrulandı; stderr sınırlı saklanır. Error/Exception önce, sonra sade stderr nedeni, en son UYARI. Stdout kalite uyarısı gerçek SystemExit mesajını artık gölgelemez. |
| B3/D3 eşit başlangıç | Doğrulandı; aynı anda başlayan kaynak satırları tek anlatıcı için sırayla okunacak tek grupta birleştirilir, tüm source_ids/metin korunur. Satır ve cümle modunda geçerli pencere; gerçek küçük WAV ile adaptive zaman çizelgesi geçti. Başlangıcı farklı örtüşmeler ayrı kalır. |
| D4 latest sync | Doğrulandı; bozuk sync yüzünden mevcut WAV yutulmaz. sync:null/syncInvalid:true döner; UI senkron garanti edilmediğini açıkça gösterir. Ses silinmez. |
| D1 plan sonrası kaynak değişimi | Doğrulandı; aynı SRT/aralık planı plain start'ta da SHA-256 ile karşılaştırılır. Tek okunan byte snapshot hem hash hem iş girdisi için kullanılır; hash sonrası copy yarışı kaldırılır. |
| B4 soğuk yükleme120s | Süre sabiti doğrulandı; default300s, --ready-timeout/--hazir-timeout30..900. Timeout açık RuntimeError olur; ikinci sunucu/GPU yüklemesi başlatılmaz. Soğuk GPU başarısı bu turda ölçülmedi. |
| B5 plansız sınır | Doğrulandı;2MB bounded read ve5000 grup/8000 karakter grup sınırı parse/make_groups'ta da var. Node start2MB'ı reddeder; pencere uygunluğu model üretiminden önce kontrol edilir. |
| B6 plan stderr | Doğrulandı; son6000 karakter toplanır, code!=0 gerçek nedenle geri döner. Mock plan hata testi geçti.15s timeout performans iddiası bug olarak kabul edilmedi. |
| B8 ffmpeg PATH | Kod açığı doğrulandı; varsa uygulamanın backend/bin klasörü mevcut PATH ve torch/lib korunarak subprocess ortamına eklenir. Sistemde ffmpeg olmasına bel bağlanmaz. |
| D5 başarısız quit iptali | Doğrulandı; pencereyi açık bırakan iptal hatası artık warning olarak görünür. Çalışan üretim zorla yetim bırakılmaz; Durdur ile yeniden deneme korunur. |
| B9 config mesajı | Doğrulandı; ayar hatası üretim başarısızlığı diye sunulmaz, gerçek hata veya ayar yüklenemedi mesajı verilir. |
| B7 pythonw import hatası | Doğrulandı; stderr bounded pipe ile tüketilir. Spawn sonrası nonzero close, mevcut dub:event üzerinde studio_error ile çağıran UI'a gider. Normal çıkış hata sayılmaz; spawn hatası mevcut guard yolundadır. |

## Hata sayılmayan / sınırlar

- Önbellekte tüm sesler varken metrics:null iddiası mevcut dalda desteklenmedi:
  cached_groups/generated_groups içeren DUB_METRICS zaten basılıyor.
- Hata modunda timing_report eksik alanları nihai manifest bozulması değildir;
  raise yüzünden o yola girilmediği rapordaki açıklamayla tutarlıdır.
- Loudnorm kurulum, spawn error→close ve sync matematiğinin doğru olduğu
  iddiaları yeni hata olarak sayılmadı.
- Otomatik tekrar model başlatma eklenmedi; gerçek VRAM/soğuk yükleme ve
  47s üretim ölçümü bu turda yeniden kanıtlanmadı.

## Testler

Geçti: dub-service (stale plain plan,2MB,plan stderr,bozuk latest sync,
warning üstüne sade gerçek hata,quit uyarısı,studio failure dahil),
dub-generator-ui (studio_error dahil), player-dub-ui, report47710,
ui-locale14/dedupe5, test_dub_module_paths1, test_report483_dub_edges3,
test_dub_timing12, test_dub_plan_regressions5, test_report468_regressions3.
Yeni timeout testinde gerçek motor yolu olmadığı için yalnız DEFAULT_REFERENCE
modülü stub; gerçek parse_args AST gövdesi çalıştı. İlk fixture eksikliği
bu şekilde giderildi, ürün sınırı/test eşiği gevşetilmedi.
JS syntax/Python py_compile/diff kontrolleri geçti. Tam paket yerelde yok;
Windows CI takip edilecek. Yeni GPU/model, gerçek pythonw pencere, dinleme,
YouTube ve üretim start.bat açılışı denenmedi. Yeni bağımlılık/kurulum yok.

Ana checkout'taki yerel3 dosya+yeni test değişikliği teslimde saklanarak
ana dal ff-only yapılacak; ilgisiz untracked dosyalar korunur. Kullanıcının
ana sürüme alma talimatı Rapor482 özelliği için devam ediyor.
