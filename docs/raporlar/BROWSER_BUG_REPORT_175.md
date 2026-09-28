# BROWSER_BUG_REPORT_175 — R195: R191 Windows el-kontrol bulgularının düzeltilmesi

**Tarih:** 2026-09-28 · **Dal:** `codex/r195-windows-manual-fixes-*` · **Taban:** master `cd206f7`

R191 Windows doğrulama oturumunun (devin-00dc112b) gerçek Windows makinede
raporladığı 3 canlı bug'ın kök-neden analizi ve düzeltmeleri. Önceki turda
yerleri saptandı; bu turda kod okunarak bug doğrulandı, düzeltildi ve her
biri için regresyon testi eklendi.

---

## 1) yt-dlp güncelleyici: sıfır-dolgulu wheel sürümü doğrulamayı kırıyordu

**Şiddet:** yüksek (özellik tamamen bozuk — her gerçek güncelleme reddediliyor)

**Kanıt:** `backend/update_ytdlp.py` `validate_runtime` PyPI metaverisinin
`info.version` değerini (PEP 440 normalizasyonu: `2026.8.19`) wheel'in
içindeki `yt_dlp.version.__version__` ile **ham dizge eşitliğiyle**
karşılaştırıyordu. yt-dlp kendi sürüm dosyasında ay/günü iki haneli
doldurur (`2026.08.19`). İkisi aynı sürüm olsa bile `"2026.8.19" != "2026.08.19"`
→ `UpdateError("...doğrulamasını geçemedi")` ve güncelleme atomik olarak
geri alınıyordu. Windows raporu bunu canlı `check-update` akışında
gözlemledi.

**Düzeltme:** `_version_parts()` sürümü int bileşen demetine indirger
(`(2026, 8, 19)`). Eşitlik artık "birebir dizge VEYA iki taraf da
nümerikse demet eşitliği". Nümerik-olmayan sürümler (dev/rc) eski
davranışa düşer: yalnız birebir eşitlik — sessiz gevşeme yok.

**Regresyon testi:** `test_zero_padded_wheel_version_matches_normalized_metadata`
(metaveri `9999.1.0` + wheel `9999.01.0` → başarı) ve
`test_truly_different_wheel_version_still_rejected` (gerçek uyumsuzluk
hâlâ reddedilir).

## 2) DeArrow topluluk başlığı hiçbir zaman uygulanmıyordu

**Şiddet:** orta (opt-in özellik sessizce hiç çalışmıyor)

**Kanıt:** `fetchDeArrowBranding` `/api/branding/<sha256öneki>` ucunu
çağırıyor. Windows makinedeki gerçek yanıt `{videoId:{titles,...}}`
**harita** zarfı; `extractDeArrowBranding` ise yalnız skipSegments tarzı
**dizi** kabul edip nesneyi `Array.isArray` kontrolünde eliyordu →
`record=null` → negatif önbellek → `res.dearrow.title` hep null.

**Düzeltme:** `extractDeArrowBranding` üç biçimi de çözer:
dizi (eski sözleşme), `payload[videoID]` doğrudan anahtar,
`payload[sha256(videoID)]` tam-hash anahtarı ve son çare olarak
kayıt-içi `videoID` alanı taraması. Kayıt bulunsa bile nesne değilse
(`'dizi-değil'`) reddedilir.

**Regresyon testi:** `browser-video-extras.test.js`'e harita zarfları için
4 yeni kontrol (videoID anahtarlı, sha256 anahtarlı, değer-içi eşleşme,
yanlış video reddi).

## 3) Canlı Whisper: GPU'suz makinede cuda seçimi sessiz ölüm

**Şiddet:** orta (özellik GPU'suz Windows makinede kullanılamaz)

**Kanıt:** `startBrowserLiveAsr` `ui.device` `'cpu'`/`'cuda'` dışındaysa
(`'auto'` dahil) veya boşsa `'cuda'`ya düşüyordu; GPU'suz makinede
`live_asr.py` `WhisperModel(... device='cuda')` yüklemesinde ölüyor
(`emit("error")` → `return 2`, ya da DLL çökmesinde hiç çıktısız close).
Kullanıcıya yalnız "süreç sona erdi" düşüyordu.

**Düzeltme:** spawn + tüm süreç kablolaması `launch(device, computeType)`
alt fonksiyonuna alındı. `'close'` olayında, iş `ready` görmeden öldüyse
ve aygıt `cuda` ise **tek seferlik** `cpu`/`int8` ile yeniden başlatılır;
kullanıcıya iki dilli `live-asr-warning` düşer
("CUDA bulunamadı; canlı Whisper CPU'ya düştü"). Hazır olduktan sonraki
ölümlerde, açık `cpu` seçiminde veya ikinci başarısızlıkta geri dönüş
yok — gerçek hata eskisi gibi raporlanır. CUDA için seçilmiş computeType
(float16) CPU'da desteklenmeyebileceğinden geri dönüş her zaman `int8`
kullanır. NDJSON `error` olayı pre-ready aşamasında artık `acquisitionPlan`'ı
başarısız kapatmaz; 'close' kararı verir (aksi halde sağlam CPU denemesi
"başarısız" diye işaretlenirdi).

**Regresyon testi:** `tests/live-asr-fallback.test.js` — vm-harness sahte
süreçlerle 4 senaryo (cuda hatası→cpu düşüşü, sessiz ölüm→cpu düşüşü,
cpu seçiminde geri dönüş yok, ready sonrası ölümde geri dönüş yok).

**Bozulan dilimler onarıldı:** `audit-tur4.test.js` ve
`browser-live-audio.test.js` `consumeLiveAsrLine`'ı
`const liveAsrLines` işaretçisiyle kesiyordu; tampon `launch()` içine
taşınınca işaretçi `canFallBackToCpu`ya güncellendi.

---

## Testler

- `backend/test_ytdlp_update.py`: 24/24 (2 yeni)
- `tests/browser-video-extras.test.js`: 11/11 (1 yeni kontrol bloğu)
- `tests/live-asr-fallback.test.js`: 4/4 (yeni dosya)
- `npm test` tam paketi: 2 başarısızlık → ikisi de yukarıdaki dilim
  işaretçileri; düzeltildi, hedefli dosyalar yeşil.

## Windows'a taşınacak el kontrolleri

- `Ayarlar → yt-dlp güncelle` gerçek güncelleme artık doğrulamayı geçmeli.
- Oynatıcıda YouTube videosu + DeArrow açıkken topluluk başlığı görünmeli
  (varsa topluluk adaylı video; `sponsor.ajay.app` erişilebilir olmalı).
- GPU'suz makinede "Canlı Whisper" başlatma: önce cuda denemesi, sonra
  uyarı rozeti + cpu/int8 ile ready; başarısız olursa görünür hata.
