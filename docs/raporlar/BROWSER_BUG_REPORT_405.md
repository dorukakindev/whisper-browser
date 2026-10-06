# BROWSER_BUG_REPORT_405 — Canlı Whisper ve tarayıcı yaşam döngüsü derin denetimi

Tarih: 2026-10-06 · Yöntem: `electron-whisper-debugging` skill'i (aşama haritası → kanıt → tek hipotez → önce başarısız test → düzeltme).

## Taban çizgisi
Node: 451 dosyadan 17 kırık — 13'ü ortam kaynaklı (jsdom, mux.js, mp4box, darkreader, resedit, srt, guessit, git deposu yok, OCR), 4'ü gerçek gerileme
(`browser-lifecycle-policy`, `dom-innerhtml-ratchet`, `report67-smarttube-wiring`, `ui-locale`). Python: `test_golden_corpus` gerçek gerileme; geri kalanı eksik paket (faster_whisper, yt_dlp, srt, genanki, guessit).

## Bulgular (aşama → kök neden → düzeltme → test)

| # | Aşama | Belirti | Kök neden | Düzeltme | Test |
|---|---|---|---|---|---|
| 1 | Süreç/IPC | Türkçe kullanıcı adlı Windows'ta canlı Whisper hiç altyazı üretmez | `live_asr` env'siz başlıyordu; Python boru stdin'ini cp1254 ile çözüp UTF-8 `%TEMP%` yolunu bozuyor | `pythonRuntimeEnv({PYTHONIOENCODING:'utf-8'})` + `sys.stdin.reconfigure('utf-8')`; gizli anahtarlar da artık sızmıyor | `live-asr-fallback.test.js`, `test_live_asr_quality.py` (ğşıöüç yolu) |
| 2 | Yakalama/saat | Reklam konuşması videonun 0–30 sn'sine canlı altyazı olarak yazılır | Reklamda medya saati reklamın saati; yakalama sürüyordu | `syncBrowserLiveAsrClock` reklamda `paused:true` | `browser-live-asr-pipeline.test.js` |
| 3 | Parçalama | Duraklat/atla sonrası "Teşekkürler." gibi halüsinasyonlar, sessiz videoda boşa GPU | Her flush 50–200 ms kırıntı ve tamamen sessiz parçayı da gönderiyordu | Worklet <0,25 sn ve tepe < −48 dBFS parçaları düşürür; 3 ardışık sessizlikte uyarı | `browser-live-asr-pipeline.test.js` (gerçek `process()` döngüsü) |
| 4 | Whisper | "Altyazı M.K." canlı ve toplu altyazıya düşer | Canlı yolda süzgeç yoktu; toplu desen yalnız "Altyazı çevirisi/Altyazı:" tanıyordu | `HARD_HALLUCINATION_PATTERNS`; canlı yol `should_skip_hallucination` + `collapse_repetition` kullanır | `test_live_asr_quality.py` |
| 5 | Whisper | Kısa parçada dil sapması (tr→az) transliterasyon çöpü | Parça başına bağımsız dil tespiti | `LanguageGate`: düşük güvenli sapma oturum diliyle yeniden çözülür; art arda yüksek güven gerçek değişimi geçirir | `test_live_asr_quality.py` |
| 6 | Gecikme | Altyazı giderek geride kalır, neden görünmez | RTF ölçülmüyordu; yalnız kuyruk dolunca hata | `chunk_done.rtf/audio_seconds`; `live-asr-realtime.js` 3 ardışık RTF>1'de tek uyarı + model önerisi, toparlanınca tek bildirim | `browser-live-asr-pipeline.test.js` |
| 7 | Pencere | Mini oynatıcıda ikinci sekme açılınca ilk sekme kalıcı boş | `close()` olayı eşzamansız; eski işleyici `window !== currentWindow` ile erken dönüyordu | Görünüm iadesi her kapanışta; durum sıfırlama yalnız güncel pencerede; `addChildView` hatasında ana pencereye geri koyma | `browser-live-asr-pipeline.test.js` (geç olay simülasyonu), `browser-lifecycle-policy.test.js` |
| 8 | İndirme | Windows'ta disk dolu/izin hatası genel iletiye düşer | Yalnız İngilizce metin deseni | `friendly_os_error` errno/winerror zinciri | `test_media.py`, `report67` |
| 9 | Spek | `test_golden_corpus` kırmızı | adr-01 "blocking" beyanı eski kip yanlış-pozitifine dayanıyordu | Beyan `register`; kapı değişmedi (yanlış-ret 0 korunur) | `test_golden_corpus.py` |

Her yeni test eski kodda çalıştırılıp başarısız olduğu doğrulandı (RTF izleyicisi yeni modül olduğundan hariç).

## Değiştirilmeyenler
Çeviri zamanlayıcısı ("hatalı cümle → yeniden çevir" döngüsü) incelendi: kalite kapısı ≤2 deneme, elle denemede zorla kabul, ağ dönüşünde yalnız geçici hatalar — yeni döngü bulunmadı, dokunulmadı.

## Aynı desenin başka yerleri
- `process-io.js` `output += chunk` Buffer→string birleştirmesi (yalnız sürüm satırı okunuyor; etkisi düşük).
- innerHTML ratchet izin listesi satır numarasına bağlı; her renderer.js düzenlemesinde kırılır — içerik tabanlı anahtar önerilir.

## Windows etkisi
1 ve 8 doğrudan Windows'a özgü; Windows'ta elle doğrulanmadı (sandbox Linux). Önerilen elle kontrol: Türkçe karakterli kullanıcı hesabında Canlı Whisper'ı başlatıp ilk cümlenin geldiğini görmek.
