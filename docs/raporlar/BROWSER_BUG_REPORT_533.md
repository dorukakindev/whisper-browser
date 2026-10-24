# BROWSER_BUG_REPORT_533 — Ana sayfadan ortak Ayarlar penceresi

2026-10-24. Repo https://github.com/dorukakindev/whisper-browser, dal `codex/luna-media-home532`, PR #482. Başlangıç HEAD `c2b689da71823a3f520ac668aeea1043921afb07`; ürün bitişi `067a7476106b01794aefaecd00fdcd4151589db5`.

## Teyit / sonuç

Kullanıcının ekran görüntüsündeki Luna tarzı ana sayfa gerçekten görünür Settings girişi taşımıyordu. API/provider/model alanları Stüdyo içindeki Çeviri ve LLM advanced bölümlerinde kalmıştı. `media-home.js` üst eylem listesi incelendi; Ayarlar eylemi yoktu. Yeni **Settings / Ayarlar**, ana sayfanın sağ üstünde dil seçiminin önüne eklendi.

Native HTML dialog tema token'larını ve IBM Plex Sans/Sora tipografisini kullanır. Masaüstünde solda bölüm gezinmesi, 800 px altı yatay gezinme, bağımsız kaydırılan form ve erişilebilir sabit Kaydet düğmesi vardır. Bölümler:

- Asistan ve çeviri: gerçek mevcut endpoint/model/API anahtarı/custom URL/kayıtlı modeller/probe/hedef dil. Asistanın bu modelle ortak çalıştığı açıklanır.
- Görsel çeviri: gerçek manga sağlayıcı/model/anahtar/custom URL, miras alma düzeni korunur.
- Metin düzeltme: gerçek llmPostprocess ve ayrı LLM sağlayıcı/model/anahtar/custom URL.
- Görünüm ve araçlar: mevcut tema/dil kontrolleri, Whisper ayrıntıları/çeviri ayrıntıları/ses stüdyosu/yedekleme bağlantıları. Bu bölüm tüm eski gelişmiş ayarların baştan yazımı değildir; ayrıntıların gerektiği yerde mevcut araç açılır.

Anahtar değerleri yeni bir forma/depo/payload'a kopyalanmaz. Mevcut kontrol düğümleri geçici placeholder ile pencereye taşınır, kendi event listener ve ID'leri korunur; sekme/pencere kapanışında özgün konumuna dönmektedir. Kaydet mevcut `saveAppSettings()` → güvenli IPC/depo yoludur. Anahtar gösterme düğmesi korunur; bölüm değişiminde/kapatmada tekrar maskelenir ve aria-pressed/etiket düzeltilir. Aynı otomatik kayıt davranışı sürer; Kapat düğmesi değişiklikleri geri alma anlamına gelmez. Test isteği yalnız mevcut test düğmesi basılırsa gönderilir. Ayar penceresi asistan bağlamına yalnız genel başlık/not verir, anahtar/input değerleri vermez.

## Entegrasyon doğrulaması

`tests/electron-app-settings.smoke.js` gerçek Windows Electron + main güvenli ayar IPC'sini ayrı test profilinde kullanır. Gerçek kullanıcı anahtarı yok; sahte fixture credential. API çağrısı **0**.

- Gerçek ana sayfa düğmesinden açılma, aynı API input nesnesi/tek ID, OpenAI endpoint ve gpt-5.4-mini seçimi, mevcut ayar deposuna fixture anahtar/modelin kaydı.
- Göster/kapat sonrası anahtar maskesi, eski parent'a geri dönüş, butona odak dönüşü.
- Hızlı cleanup→kapat→manga açma, genel görünüm/dil alanları, canlı TR→EN ve koyu→açık tema.
- 1440×1000 TR koyu, minimum pencere sınırı test için kaldırılarak **gerçek 720×680 EN açık**; pencere sınırı, yatay taşma, Kaydet erişimi. Native screenshot'lar incelendi: `.uiprev/app-settings/1792861419594-18860/`. İlk screenshot'ların sola/yukarı yaslanması explicit dialog inset/margin ile ortalandı.
- Geliştirme sırasında hızlı close/open queued close event'i yeni form düğümlerini geri taşıyabiliyordu. Cleanup eşzamanlı ve modal kimliğine bağlı oldu; gecikmiş eski event yeni modalı etkilemez. Bu entegrasyon kusuru teslimden önce aynı gerçek Windows akışında giderildi. İlk smoke'un odak varsayımı da gerçek focus+click akışına düzeltildi; ürün bugı sayılmadı.
- `node --test tests/media-home-model.test.js tests/package-integrity.test.js`: 13 geçti. `preload-usage-ratchet`: 285 export, 7 bilinçli dormant, kullanılmayan yok. Değişen JS node --check ve git diff --check geçti.

## Sınırlar

Yeni API/sağlayıcı mantığı, yeni bağımlılık, yeni IPC veya yeni secret storage yok. Uygulama kaydını doğrulayan test canlı ücretli çağrı yapmaz. Gerçek provider probe, normal start.bat, CUDA, aktif kullanıcı Browser video yüzeyinin bu dialogla kompozisyonu bu tur yeniden koşulmadı. Dialog mevcut syncBrowserOcclusion yolunu kullanır. Tam npm test/CI beklenmedi; kapatılmadı. Açık uygulama kaynak değişikliğiyle kendiliğinden güncellenmez. Ana kullanıcı kopyası/master merge edilmedi; PR482 dalında teslim. Güvenli profil, gerçek anahtar veya ham kişisel görüntü Git'e alınmadı.
