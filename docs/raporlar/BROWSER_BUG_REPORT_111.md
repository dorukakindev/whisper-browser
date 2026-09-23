# BROWSER_BUG_REPORT_111 — Altyazı çevirisi gerçek çıktı kalitesi: uçtan uca denetim

**Dal:** `codex/r111-qa-output` · **Baz:** `origin/master` (`f624e38`, R110 SDH düzeltmesi dahil) · **Bitiş kod commiti:** bu dalın kod commit'i (aşağıdaki teslim bölümü)
**Ortam:** Ubuntu 22.04.5 · node v24.19.0 · python 3.12.14 (backend/venv) · Electron v43.2.0 · X/VNC 1600×1200 · ffmpeg
**Yöntem:** Deterministik E2E ölçüm sürücüsü (`/home/ubuntu/qa-111/run_e2e.py`): gerçek `transcribe.py --translate-only` alt süreci → yerel fixture OpenAI uç noktası (`127.0.0.1:8788`, `qa-109/fixture_server.py`) → gerçek `.tr.srt` çıktısı → yapısal iddialar + sağlayıcı istek sayımı (`/ctl/requests`). Sıfır gerçek anahtar/hesap. Electron ayağı: ayrı profil (`/home/ubuntu/qa-111/profile`), gerçek dosya seçici (GTK) ile açılan `clip.mp4`, CDP + ekran görüntüsü.

## Doğrulanan zincir

`kaynak SRT → cümle gruplama → sağlayıcı yanıtı → cue'lara dağıtım → SDH geri koyma → son SRT → oynatıcıda gösterim` — her halka hem fixture sunucu logundan hem ham çıktı dosyasından hem de gerçek oynatıcı overlay'inden ölçüldü.

## Bulunan ve düzeltilen gerçek kusur

### BUG-R111-01 — Yalnız-SDH cue'unda sağlayıcının doğru yanıtı "kaynak yankısı" sanılıp kurtarma yakılıyor

- **Tetikleyici:** Tamamen SDH işaretinden oluşan cue (`[music playing]`) için sağlayıcı işareti aynen döndürür — bu cue'nun "çevirisi" işaretin kendisidir.
- **Beklenen:** Yanıt kabul edilsin, tek istekle iş bitsin, çıktı `status: complete` olsun.
- **Gözlenen (düzeltme öncesi, deterministik):** Toplu yanıtta `ret: kaynak_yankisi=1` → `retry_groups_once` **2 ek istek** yaktı (toplam 3 istek/8 cue). Kurtarma katmanı farklı bir metin kabul edince `restore_sdh_markers` kaynak işareti + hedef metni yan yana bastı: `[music playing] [müzik çalıyor]`. Ardından kalite raporu aynı cue'u `untranslated_source` saydığı için dosya `.tr.partial.srt` olarak yazıldı ve "1 kaynak metinli cue" uyarısı üretildi.
- **Kod yolu:** `transcribe.py` — echo kapısının dört kullanımı: toplu kabul (`llm_translate` ~3607), refine kabulü (~3946), `compute_translation_quality_report` untranslated ölçümü (~5181), `--translate-existing` devralma (~6994/7003). Hiçbiri `is_structural_sdh_cue` muafiyeti tanımıyordu.
- **Kırmızı kanıt:** `test_sentence_distribution.py::test_lone_sdh_marker_echo_is_not_rejected` → düzeltme öncesi `3 istek: kurtarma tetiklendi` ile FAIL; E2E'de `1 toplu + 2 kurtarma` + `untranslated_indices: [4]` + `.partial.srt`.
- **Düzeltme:** Dört noktada `is_structural_sdh_cue(kaynak)` muafiyeti — yalnızca yapısal SDH cue'unda birebir dönüş "yankı" sayılmaz. Diyalog echo kapısı korunuyor (`test_dialogue_echo_still_rejected`: echo yanıtı hâlâ ret → 3 istek → kurtarma).
- **Yeşil kanıt:** Aynı fixture koşusu `1 toplu + 0 kurtarma = 1 istek`, `untranslated: 0`, `status: complete`, cue5 = `[music playing]` (tek işaret). **Durum: doğrulandı ve düzeltildi.**

## Kapsam tablosu (fixture senaryoları → sonuç)

Sürücü: `/home/ubuntu/qa-111/run_e2e.py` · Sonuç: **65/65 kontrol** (`qa-111/logs/e2e-results.json`)

| Senaryo / zorunlu invariant | Sonuç | Kanıt |
|---|---|---|
| Cümle ortasından kesilen cue'lar (2/4 cue'ya bölünmüş cümle) | doğrulandı | `a-split2`, `a-split34`: `[0,1]` / `[0,1,2,3]` tek grup, parçalı dağıtım, zaman kodları birebir |
| Aynı cue içinde iki cümle ("Wait. Are you sure…") | doğrulandı | `b-twosent`: çıktı cue'sunda gerçek `\n` (`Bekle.`⏎`Emin misin`), satır içi cümle ayrışmadı |
| Sayı/özel ad cue sınırı aşması | doğrulandı | `c-nums`, `a-split2`: `2.4 milyon`, `Dr. Lawson`, `Persephone`/`80 kilometers` demirlemesi grupta tutulur |
| TR soru eki/bağlaç tek başına kalması | doğrulandı | `gate-tail`: `Emin\|misin` bölünmesi reddedildi → kurtarma yalnız `[[0,1]]` grubunu 2 kez yeniden gönderdi |
| Birden çok SDH etiketi | doğrulandı | `e-sdh`: `[applause] [music playing]` ikisi de geri konur |
| Yalnız SDH cue | **kusur bulundu → düzeltildi** | BUG-R111-01; sonrası `sdh:lone` PASS, tek istek |
| Satır-içi SDH (descriptor model girdisinden çıkarılır) | doğrulandı | `e-sdh`: `(crowd cheering)` payload'da yok, çıktıda geri konmuş |
| Konuşmacı değişimi (`- ` cue'lar) | doğrulandı | `f-speaker`: 3 cue tekli grup, `-` öneki korunur |
| Noktalamasız otomatik altyazı | doğrulandı | `h-unpunct`: 3 cue tek grup, tek istek |
| Kaynak zaman kodu + cue sırası | doğrulandı | 9 fixture × `same_timeline` (cue sayısı + ms başlangıç/bitiş birebir) |
| Nokta sonrası cümle aynı satıra karışmaz | doğrulandı | `twosent:newline-in-cue` + cue3 görsel kanıtı |
| Yarım/anlamsız TR parça ekranda | doğrulandı | `no-empty` tüm fixture'larda; echo/bozuk dağıtımlar kapılara takılır |
| Tekrar işlenen içerik → gereksiz istek/token | doğrulandı | aynı dosya ikinci koşu: **0 istek** ("Tum bloklar onbellekten geldi") |
| 1 cue düzenlenirse yeniden maliyet | ölçüldü (tasarım) | 10-cue dosyada 1 cue değişimi → bağlam anahtarlı geçersizleşme ±4 grup: **9/10 grup yeniden** (öndeki `Step A` temiz). `--translate-existing` ile aynı düzenleme: **0 istek + elle düzeltme korunur** |
| Kurtarma yalnız başarısız grubu yeniden gönderir | doğrulandı | `gate-tail:rescue-only-failed`: yalnız `[[0,1]]` iki deneme; başarılı gruplar tekrar istenmedi |
| Kapılar bozuk sağlayıcı yanıtını eler | doğrulandı | anchor-swap (sayı/ad başka cue'ya), echo, join-mismatch senaryoları ret → kurtarma → doğru çıktı |

## Gerçek Electron doğrulaması (ayrı profil)

- Medya: `qa-111/media/clip.mp4` (testsrc 22 sn — kare üzeri zaman damgası overlay'i render kanıtı verir) + `clip.en.srt` + `clip.tr.srt` (fixture pipeline'ının gerçek çıktısı, `status: complete`).
- Akış: `playerPickVideo` → GTK dosya seçici (bilgisayar aracıyla, insan yolu) → `mediaFileAccess` grant → `attachSiblingSubtitles` **kardeş altyazıları kendisi buldu** (`sel` = `clip.en.srt` + `clip.tr.srt`), ilkini otomatik yükledi → `loadSubtitle(clip.tr.srt)` → `player.cues` = 8 TR cue.
- Video yüzeyi ekran görüntüleri (`qa-111/shots/`):
  - `cue3-twosent.png` — overlay'de **iki satır**: `Bekle.` / `Emin misin` (cue-içi `\n` videoda görsel satır sonu olarak render ediliyor)
  - `cue5-lone-sdh.png` — `[music playing]` (düzeltme sonrası tek işaret)
  - `cue6-multi-sdh.png` — `[alkış] [music playing] Ayağa kalktı.`
  - `cue7-num.png` — `Bana 2.4 milyon` (cue sınırı aşan sayı bütün)
- DOM ile piksel eşleşmesi: `subtitleOverlay.innerText` = overlay'de görünen metin; transcript paneli aktif cue'yu aynı zaman damgasıyla vurguluyor.

## Test sayıları

- `backend/test_sentence_distribution.py`: **36/36** (2 yeni regresyon: `test_lone_sdh_marker_echo_is_not_rejected`, `test_dialogue_echo_still_rejected`)
- `backend/test_transcribe.py`: **192/192** · `test_subtitle_sdh.py`: 8/8 · `test_golden_corpus.py`: 6/6 · `test_translation_memory.py`: 6/6 · `test_turkish_native_refine.py`: 3/3 · `test_translation_quality_corpus.py`: 4/4 · `test_output_newlines.py`: 1/1
- E2E ölçüm sürücüsü: **65/65** kontrol
- `py_compile transcribe.py`: temiz. Tam `npm test` kasıtlı çalıştırılmadı (kural 4) — değişiklikle ilgili hedefli setler yukarıda.

## Dürüst sınırlar

- Fixture sağlayıcı deterministik/senarili — **ücretli model kalitesi kanıtı değildir** (N7). Ölçülen şey: dağıtım/geri-koyma/kapı/maliyet mekaniğinin doğruluğu.
- `restore_sdh_markers` eşleşmeyen hedef işaretini düşürüp kaynak işareti korur (R110 politikası): model `[müzik]` döndürürse çıktı `[music playing]` kalır — tasarım tercihi, raporluyorum kusur olarak değil.
- GTK yerel dosya seçici bilgisayar aracıyla sürüldü (Ctrl+L yolu + Open düğmesi); `wmctrl` ile kalan eski dialog pencereleri bir ölçüm takıntısı doğurdu, insan davranışıyla aynı akış sonunda doğrulandı.
- 10-cue düzenleme senaryosunda bağlam-anahtarlı geçersizleşmenin ±4 grup sınırı ölçüldü; bu çeviri kalitesi için kasıtlı tasarım (kısa replikler bağlamsız çevrilmesin). Kusur sayılmadı; maliyet olarak belgelendi.
- Pencere yeniden boyutlandırma/dar-zoom davranışları bu turda ölçülmedi (rapor 109'da kapsandı).
