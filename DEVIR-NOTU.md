# Devir notları indeksi

Güncel çalışma: [2026-09-14-1238 — GitHub araştırması: browser için sonraki adaylar](docs/devir/2026-09-14-1238.md)

Önceki çalışma: [2026-09-14-1231 — Browser video ve altyazı araçları](docs/devir/2026-09-14-1231.md)

Önceki çalışma: [2026-09-14-1200 — GitHub araştırması: yeni browser özellikleri](docs/devir/2026-09-14-1200.md)

Önceki çalışma: [2026-09-14-1157 — Arka plan gezinmesinde altyazı ve çeviri yalıtımı](docs/devir/2026-09-14-1157.md)

Önceki çalışma: [2026-09-14-1147 — Browser altyazı katmanı, konum ve durum mesajı düzeltmeleri](docs/devir/2026-09-14-1147.md)

Önceki çalışma: [2026-09-14-1133 — Git bağlantı hatasının Proxifier ile ilişkisi](docs/devir/2026-09-14-1133.md)

Önceki çalışma: [2026-09-14-1128 — İzlerken görünüm, senkron, elle eşleştirme ve AI taslakları](docs/devir/2026-09-14-1128.md)

Önceki çalışma: [2026-09-14-1110 — Format sonrası geliştirme ortamının kurulması](docs/devir/2026-09-14-1110.md)

Önceki çalışma: [2026-09-14-0713 — Format sonrası kalıcı çalışma kuralları ve devralma rehberi](docs/devir/2026-09-14-0713.md)

Önceki çalışma: [2026-09-14-0657 — Browser kararlılığı, birleşik izleme, AI değerlendirmesi ve yeniden açma](docs/devir/2026-09-14-0657.md)

Önceki çalışma: [2026-09-14-0636 — Browser AI bağlamı, tutarlılık, hata yönetimi ve kaynaklar](docs/devir/2026-09-14-0636.md)

Önceki çalışma: [2026-09-14-0611 — Altyazı önizlemesi, kalite kontrolü ve kaynak düzeltmeleri](docs/devir/2026-09-14-0611.md)

Önceki çalışma: [2026-09-14-0543 — Yayın altyazısı kararlılığı ve birleşik düzenleme paneli](docs/devir/2026-09-14-0543.md)

Önceki çalışma: [2026-09-14-0514 — GitHub araştırması ve tarayıcı geliştirme önerileri](docs/devir/2026-09-14-0514.md)

Önceki çalışma: [2026-09-14-0510 — Tarayıcı altyazısı teslimi; kullanıcı onaylı test istisnaları](docs/devir/2026-09-14-0510.md)

Önceki çalışma: [2026-09-14-0459 — Ortam engeli denetimi; hedef tamamlanmadı](docs/devir/2026-09-14-0459.md)

Önceki çalışma: [2026-09-14-0456 — Kararlılık kapanışı; ortam engelleri açık](docs/devir/2026-09-14-0456.md)

Önceki çalışma: [2026-09-14-0415 — Altyazı yönetimi, kurtarma ve tam ekran kontrolleri](docs/devir/2026-09-14-0415.md)

Önceki çalışma: [2026-09-14-0328 — Tarayıcı durumu, video tercihleri ve tam ekran](docs/devir/2026-09-14-0328.md)

Önceki çalışma: [2026-09-14-0250 — Tarayıcı tasarımı ve altyazı kurtarma](docs/devir/2026-09-14-0250.md)

Her yeni çalışma `docs/devir/YYYY-MM-DD-HHMM.md` altında ayrı tutulur. Eski notlar silinmez.

## Önceki kök not (özgün içerik korunmuştur)

# Devir Notu — dal kurtarma çalışması

Son güncelleme: 2026-09-08 · master = `ebe582d` · `npm test` **yeşil** (120 dosya)

> **Bu not tarihsel kayıttır** — dal kurtarma çalışmasının nasıl yapıldığını anlatır.
> Kalan iş ve nereden devam edileceği için `ENTEGRASYON-PLANI.md` dosyasına bak.

## Durum

40 birleşmemiş dal / 139 commit vardı. Toplu birleştirme denendi ve **reddedildi**:
en kolay dal (`whard-32`) bile 9 *anlamsal* çakışma verdi — iki taraf aynı fonksiyonu
farklı yönlerde geliştirmiş, satır seçmek yetmiyor.

Yerine kullanılan yöntem: **dalın kodunu değil, testlerini master'a getir.** Test
yürütülebilir şartname olduğu için hangi düzeltmenin gerçekten eksik olduğunu
çalıştırarak söylüyor. Kalan test = güncel kodda gerçek hata; geçen test = o dal
o konuda gereksiz.

## Master'a giren (bitti)

| Commit | İçerik |
|---|---|
| `d992227` | Çıktı sağlamlaştırma + 3 regresyon düzeltmesi (çifte entity çözme, kısmen bozuk TTML'de tüm altyazının silinmesi, ASS word-joiner birikmesi) |
| `c68548f` | `src/watch-library-view.js` + 4 test |
| `6837e6a` | **Kütüphane araması ana süreci dondurmuyor**: 1711 ms → 9,6 ms; iptal edilebilir |
| `f8daf8f` | `src/watch-library-store.js` + 158 göç/fault-injection testi |
| `1eabdfb` | `backend/io_errors.py`, `backend/update_ytdlp.py`, `src/process-io.js` + 20 test |

## Sonradan yapılanlar

Bu not yazıldıktan sonra `ENTEGRASYON-PLANI.md` üzerinden 6 kalem daha girdi:
K1 kütüphane deposu bağlantısı (`34c807d`), K2 yt-dlp atomik runtime (`1d697ae`),
K3 ayar güvenliği (`98f8369`), K4 kuyruk yaşam döngüsü (`b7d7ffc`),
K5 tek-yazar + kapanış flush'ı (`6392461`), K8 CDP sızıntısı (`da0c4c6`, kısmi).
**Açık kalan: K6 ve K7.** Aşağıdaki iki madde artık ÇÖZÜLDÜ, tarihsel kayıt
olarak duruyor:

## Bilerek bağlanmadı (o gün — ikisi de sonradan çözüldü)

### 1. `src/watch-library-store.js` main.js'e bağlı değil
Bağlamadan önce master'daki iki koruma depoya taşınmalı, yoksa kaybolur:
- `upsertWatchItem` boyut sınırı (128 KB patch / 256 KB birleşmiş kayıt) —
  tek dev IPC kaydının diski doldurmasını engelliyor.
- `library:remove` IPC'si notları/kelimeleri/watch index'i koruyarak siliyor;
  deponun sade `remove`'u bunu yapmıyor.

Ayrıca deponun `upsert`'ü `completionOverride`/`automaticCompleted`/`revision`
alanlarını yönetiyor; master'ın tamamlanma mantığıyla (bkz. `03fb06f`) çakışmadığı
doğrulanmalı. **Gerçek izleme geçmişi verisine dokunuyor — dikkatli ilerle.**

### 2. `src/ytdlp-runtime.js` alınmadı
Testi, `maintenance:updateYtdlp` handler'ının `backend/update_ytdlp.py`'ye
bağlanmış olmasını şart koşuyor. Master hâlâ venv içine `pip install` yapıyor.
`backend/update_ytdlp.py` master'da hazır bekliyor; geriye main.js bağlantısı kaldı.
Kaynak: `codex/whard-37-ffmpeg-ytdlp-burnin-windows-io`.

## Henüz bakılmamış altsistemler

Hepsi `trial/tum-testler` dalında testleriyle duruyor. Her biri ~1 test:
`watch-library-state`, `settings-security`, `pipeline-job`,
`renderer/queue-lifecycle`, `renderer-ui-model`, `resource-soak`,
`tools/install-orchestrator`.

Yöntem her seferinde aynı:
1. master'dan worktree aç
2. `git checkout <dal> -- <modül> <testleri>`
3. testi çalıştır — geçiyorsa commit, kalıyorsa **önce testin ne iddia ettiğini oku**
   (eski sözleşme olabilir; kodu değil testi uyarlamak gerekebilir)
4. `npm test` yeşil kalmadan commit yok
5. `git merge --ff-only` ile master'a al

## Uyarı — geçmişte yapılan hata

"Bu düzeltme master'da var mı" sorusuna **fonksiyonun varlığına bakarak** cevap verilmişti;
`reexport_from_json` vardı ama davranışı yanlıştı (kaynak dosyanın üzerine yazıyordu,
veri kaybı). Varlık ≠ doğruluk. Her zaman çalıştırarak doğrula.

## Silinmemesi gerekenler

- `trial/tum-testler` — B grubunun 52 test dosyasının tek kaynağı.
- `codex/whard-*`, `codex/wl-*` dalları — modüllerin kaynağı.
