# BROWSER_BUG_REPORT_241 — Yeni master denetimi ve dar panel native görünürlük yarışı

Tarih: 2026-09-30 (İstanbul). Repo: `dorukakindev/whisper-browser`. İnceleme tabanı: yerel `master` `28ea5be145f5d46ca08bf0758270b20cea02222c`, uzak `master` `984befdea5ee10c7c1938effcf14959e5dceec62`.

## Bulgular

1. **Teslim dalı güncel değildi.** Uzak `master` R273–R280 kapsamında sekiz commit ilerlemişti. PR #148 GitHub'da `mergeable=false`, `mergeable_state=dirty` durumundaydı. Geçmişi koruyan merge ile iki dalın ürün kodu birleşti; geçmiş silinmedi.
2. **Rapor adı tekrar çakıştı.** Önceki yerel rapor önce R178, sonra R225 adını almıştı; uzak master da farklı içerikli bir R225 ekledi. Uzak R225 yerinde bırakıldı. Yerel rapor önce R233'e taşındı; açık PR #232 de R233 kullanınca [R240'a](BROWSER_BUG_REPORT_240.md) taşındı. Bu denetim R241 oldu. Aradaki boş numaralar eşzamanlı PR'ların belge adı yarışını önlemek içindir; #148 uzun süre açık kalırsa ileride yeniden çakışma yaşanabilir. Önceki notların bağlantıları düzeltildi. R225 artık R275 IPC payload fuzz raporudur.
3. **Dar panel açılırken native sayfa geç gizlenebiliyordu.** 940×680 transkript durumunda Windows Electron yerleşim testi ilk koşuda `native browser visibility is incorrect` ile kırmızı çıktı (gerçek değer `true`, beklenen `false`). `applyBrowserOcclusion` tüm görünmez olacak sayfa üzerinde bile `snapshotBrowserPage` bekliyordu; dar panel sayfayı tamamen kapattığından görüntüye ihtiyaç yok. `narrow-panel-takeover` durumunda bu yakalama atlanıp native görünüm hemen gizlenir. Aynı 21 durumluk test düzeltme sonrası üç kısa koşuda çıktı kodu 0 verdi. İlk başarısızlık aralıklıydı; üç yeşil koşu tüm yavaş Windows/DPI ortamları için garanti değildir.
4. **İnceleme sırasında açık işler vardı.** İlk kontrolde PR #229 beş kalıcı deponun fsync dayanıklılığını düzeltiyordu ve Windows/Ubuntu CI başarılıydı; teslim öncesinde uzak `master`a birleşti. Bu ilerleme ikinci bir merge ile alındı; `store-durability-matrix` 23 kontrol geçti. PR #230 rapor indeksini tamamladı ve o da uzak `master`a birleşince alındı. Son API kontrolünde PR #231 (çeviri prompt golden), #232 (kuyruk seçenek roundtrip fuzz), #233 (cue sınırı stresi), #234 (burn-in recovery sürüm kapısı) açıktı. Kullanıcı incelemesi bekleyen PR'lar otomatik merge/cherry-pick edilmedi.
5. **İlk CI kırmızıydı; izin kapsamı genişletilmedi.** Dar panel düzeltmesi `renderer.js` içinde üç satır ekledi. `dom-innerhtml-ratchet` güvenlik testi 11 önceden doğrulanmış yerel ifadeyi kaynak satır numarasıyla eşliyor; iki platform CI aynı 11 girdiyi artık üç satır aşağıda bulduğundan tek dosya başarısızdı. İfadeler ve güvenli olma gerekçeleri değişmedi. Yalnız izin listesinin satır numaraları +3 taşındı; testin iki denetimi yerelde yeşile döndü. Yeni CI sonucu ayrıca beklenir.

Önceki ekran görüntülerindeki **araç çubuğu SVG simgeleri** R173'te düzeltilmişti; bu turdaki R273 "glif" değişikliği gömülü altyazı font uyarısıyla ilgilidir. Güncel birleşik ağaçta ayrı simge hizalama Electron testi geçti.

## Hedefli kanıt

- Node: `r273-review-triage`, `sponsorblock-fetch-resilience`, `window-state`, `ipc-payload-fuzz` dosyaları tek tek çıktı kodu 0; `live-asr-worklet` 13 kontrol geçti.
- Python venv: `backend.test_probe_refinement_r273` ve `backend.test_ass_override_roundtrip` toplam 3 unittest geçti.
- PR #229 uzak `master`a birleşip bu dala alındıktan sonra `node tests/store-durability-matrix.test.js`: 23 kontrol geçti.
- Windows Electron yalıtılmış profil: `electron-browser-icon-alignment.smoke.js` geçti; `electron-browser-experience-smoke.js` layout modu ilk koşuda 940×680 transkript görünürlüğünde kırmızı, ürün düzeltmesinden sonra 3 × 21 durum geçti. Loglar ignore edilen `scratch` klasöründe.
- `node --check src/renderer/renderer.js` ve `git diff --cached --check` temizdi.
- İlk Windows/Ubuntu CI `dom-innerhtml-ratchet` satır kayması yüzünden başarısız oldu. `node tests/dom-innerhtml-ratchet.test.js` düzeltmeden sonra iki denetimle geçti; `node --check tests/dom-innerhtml-ratchet.test.js` temiz. Test silinmedi, eşiği gevşetilmedi.

Tam `npm test`, gerçek sağlayıcı, güç kesintisi, kullanıcı profili, GPU/DRM ve `start.bat` üzerinden medya açılışı yapılmadı. Son teslim commit'inin Windows CI sonucu ayrıca doğrulanmalı. Yeni bağımlılık, şema veya kurulum değişikliği yok.
