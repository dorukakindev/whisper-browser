# BROWSER_BUG_REPORT_397 — Windows elle doğrulama: NTP pointer düzeltmesi (PR #438 @ `0e9d115`)

Tarih: 2026-10-02 (UTC). Repo: `dorukakindev/whisper-browser`. Doğrulama tabanı: `master` `0e9d115636b0b2c22bce11a51034d27e762d8efa` (R396 raporundan bu yana: #437 doküman merge + #438 NTP pointer fix). Dal: `codex/windows-manual-check-2026-10-02-r2`.

Yöntem: gerçek Windows, `start.bat` → DRM `h`, açık tema, EN arayüz, CPU. Kod değiştirilmedi. Kanıtlar doğrulama makinesinde `verify-r236\shots\w397-*.png` ve `screencasts\rec-w397-edited.mp4` (repo dışı).

## Özet

| Madde | Sonuç |
|-------|-------|
| 1. Boş sekme NTP pointer | **KALDI** — temiz açılışta hâlâ ölü; oturum içinde aralıklı iyileşiyor |
| 2. Video oynatıcı + "Resume" akışı | **GEÇTİ** (çekirdek) |
| 3. PDF çeviri onay diyaloğu pointer | **GEÇTİ** — fix bu yüzeyde işe yaradı |
| 4. PDF sayfa-atlama sapması (200→153) | **GEÇTİ** — tekrar üretilemedi |

## 1. Boş sekme NTP pointer — KALDI (FAIL), ancak aralıklı

- **Temiz açılışta tutarlı repro:** `start.bat`→`h`→BROWSER→`Ctrl+T`→boş sekme: arama kutusu tık+yazma metin girmiyor, kutucuk/devam kartı/× tıklanmıyor, sağ tık menü çıkarmıyor. Klavye (Tab+Enter) çalışıyor.
- **Aralıklılık (kritik nüans):** aynı oturumda yeterli görünüm geçişi sonrası NTP tamamen canlanıyor — arama yazıyor, kutucuklar navigate ediyor, × kaldırıp "Restore hidden (1)" geri getiriyor, devam kartı videoyu 5:52'den açıyor. Yani slot'u kaplayan view bazı durumlarda kalıyor, sonra kayboluyor.
- **Kanıtlanan kök neden — başıboş WebContentsView:** ölü boş sekmede adres çubuğuna `example.com` yazınca URL+başlık doğru güncellendi ama içerik alanı **stale YouTube Big Buck Bunny** boyadı (`w397-examplecom-shows-stale-bbb.png`). NTP'de bu view görünmez-ama-hit-testable (pointer ölür); gerçek sayfada görünür+eski-içerik (yanlış sayfa boyanır).
- **#438 değerlendirmesi:** fix yalnız `ensureBrowserView` içinde **yeni yaratılan** view'ı ekran dışına taşıyor (`main.js:13261`). Slot'u kaplayan başıboş view başka bir yoldan geliyor → açılış durumunu düzeltmiyor.
- Şüpheli yollar: `browserTabHasPage` — hiç yüklenmemiş view'da `getURL()===''` ve `'' !== 'about:blank'` → "sayfası var" sayılıp `browserTabShouldBeVisible` ile slot'a konumlanabilir; `applyBrowserViewBounds` `setBounds(slot)`'u koşulsuz çağırıyor; `browserSplitSecondaryTabId` ve `browserExtras.mini.owns` da slot'a view yerleştiren yollar.
- Aynı ailenin diğer belirtileri (şimdi tutarlı): navigate edilen sekmede **önceki sayfanın içeriği** üstte kalır (example.com→BBB, bbc.com→IANA, npr.org→IANA; `Ctrl+R` düzeltir) ve `Ctrl+T`/navigasyonda beklenmedik **"Küçük oynatıcı" mini-PiP** beliriyor.
- Kanıt: `w397-ntp-dead-at-launch.png`, `w397-ntp-dead-launch-2.png`, `w397-ntp-dead.png`, `w397-staleview-examplecom.png`.

## 2. Video oynatıcı + Resume — GEÇTİ (çekirdek)

- `.player` yüzeyi açılıyor: ⋯→Page→Source and playback→Local file→`sample90.mp4` → tam kontroller + altyazı render + 1.25× (`w397-player-sample90-subtitles.png`).
- YouTube webview'de oynuyor + altyazı çalışma paneli açılıyor (`w397-video-player-open.png`).
- Resume mekanizması çalışıyor: Library "Continue" → kaydedilmiş konuma dönüş; canlı NTP devam kartı → BBB **5:52/10:34**'ten sürdü (`w397-continuecard-resume-552.png`, `w397-library-continue-resume.png`).
- Literal `#resumeChip` overlay (`saved.t>=30` + 12 sn auto-hide) bu turda görsel yakalanamadı — aynı-src reload atlanınca `loadedmetadata` tetiklenmiyor. Mekanizma kanıtlı; chip görselliği kısmen doğrulanmadı.

## 3. PDF çeviri onay diyaloğu pointer — GEÇTİ

`book300.pdf` → "Translate entire book" → onay diyaloğunda **"Translate" düğmesi artık fareyle tıklanabilir** → "Translating book… (0/300)" başladı; Cancel çalışıyor. Önceki turda bu düğme pointer'a ölüydü — #438 bu yüzeyde etkili oldu. Kanıt: `w397-pdf-translate-confirm.png`, `w397-pdf-translating-0of300.png`.

## 4. PDF sayfa-atlama sapması — GEÇTİ (tekrarlanamadı)

`book300` sayfa kutusuna 200 → **PAGE 200** doğru; önceki turdaki 200→153 sapması üretilemedi. Kalan minör: kutuya ilk Enter'da değer görünür ama view kıpırdamaz; bir scroll sonrası commit olur (flaky first-Enter). Kanıt: `w397-pdf-page200.png`.

## Açık kusurlar (raporlandı, düzeltilmedi)

1. **NTP ölü-pointer (açılış durumu)** — ana bug; başıboş WebContentsView slot'u kaplıyor, #438 kapsamı dışında. Tur-3 §8/9/11 açılışta hâlâ başarısız.
2. **Stale-content view** — navigasyonda önceki sayfa boyanıyor; `Ctrl+R` düzeltir.
3. **Mini-PiP beklenmedik popup** — `Ctrl+T`/navigasyonda "Küçük oynatıcı" beliriyor.
4. Minör: PDF sayfa kutusu ilk-Enter commit güvenilmez; EN modda "Çeviri iptal edildi" Türkçe metni (R396'dan taşınan, hâlâ).

## Öneri

`hideBrowserViewOffscreen`'in yalnız view-yaratımında değil, slot'a konumlandırma yapan tüm yollarda (`browserTabShouldBeVisible`/`applyBrowserViewBounds`, split-secondary, mini-player) uygulanması; `browserTabHasPage`'in `getURL()===''` durumunu "sayfasız" sayması.
