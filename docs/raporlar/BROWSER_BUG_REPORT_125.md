# R125 — A'dan Z'ye derin bug denetimi (kod değiştirmeden)

> **Yeniden adlandırma notu:** Bu dosya `haze/bug-report-2026-09-24` dalında `docs/raporlar/BROWSER_BUG_REPORT_124.md` olarak yazılmıştı; master'da 124 numarası R124 teslimine ait olduğundan çakışmayı çözmek için 125 olarak kaydedildi. İçerik aynıdır; bulgu kimlikleri R124-0x biçimi korunmuştur.

Tarih: 2026-09-25. Dal: `haze/bug-report-2026-09-24`. Başlangıç HEAD: `1fbc03f380fba6692078ef8a8490b30f469a559b`.
Kapsam: `backend/transcribe.py`, `backend/media.py`, `backend/invidious.py`, `backend/youtube.py`,
`backend/pipeline_control.py`, `backend/sentence_translation.py`, `backend/update_ytdlp.py`,
`src/main.js`, `src/preload.js`, `src/renderer/renderer.js`, `src/browser-subtitles.js`,
`src/browser-translation-scheduler.js`, `src/browser-session-store.js`, `src/browser-media-controller.js`,
`tools/install-orchestrator.js`, `install.bat`, `start.bat` ve test altyapısı.
Bu turda ürün kodu değiştirilmedi; kullanıcı talimatı gereği yalnız rapor üretildi.

## Özet

| Kimlik | Seviye | Bileşen | Durum |
|---|---|---|---|
| R124-01 | P2 | `backend/invidious.py::_vtt_to_srt` | Kesin — koşullu veri kaybı |
| R124-02 | P3 | `MAX_MEDIA_TIME_SECONDS` (2 dosya) | Kesin — birim/sabit hatası, zararsız |
| R124-03 | P3 | Renderer/backend zaman-biçimi asimetrisi | Kesin — kozmetik tutarsızlık |
| — | — | U+2060 WJ, arg-uyumsuzluğu, eski testler, `wrap_text`, `srt_time` | İncelendi, reddedildi (bulgu değil) |

Tam `npm test` paketi bu oturumda baştan sona koşuldu ve **tüm testler geçti**
(Node tarafları + 198/198 çeviri birim testi + Python unittest'leri dahil).

---

## Kesin bulgu: R124-01 — `_vtt_to_srt` boş satırsız ardışık cue'ları sessizce düşürüyor

- **Dosya/satır:** `backend/invidious.py:356-386` (`_vtt_to_srt`). Çağıranlar:
  `fetch_subs` içinde ~`451-454` (`content.lstrip().startswith("WEBVTT")` dalı) ve
  `_convert_timedtext_to_srt` içinde ~`471-472` (WEBVTT gövdesini aynı dönüştürücüye devreder).
- **Kök neden:** `cur` yalnızca boş satır görünce `cues`'a ekleniyor. Yeni bir `-->`
  satırı geldiğinde `cur = [yeni_zaman]` doğrudan üzerine yazılıyor; boş satırla
  kapatılmamış önceki cue (zaman + metin) **hiçbir uyarı olmadan atılıyor**.
  Ayrıca `elif cur is not None:` ölü koşul — `cur` hiçbir zaman `None` olmuyor.
- **Erişilebilir yol:** Renderer `invidious:subs` IPC → `runInvidiousCommand` →
  `backend/invidious.py --subs` → `fetch_subs` → caption/timedtext gövdesi WEBVTT ise
  `_vtt_to_srt` → SRT dosyası → `subs` olayıyla oynatıcıya yüklenir.
- **Kullanıcı etkisi:** Boş satır ayraçlı olmayan (compact/malformed) WEBVTT döndüren bir
  Invidious/proxy kaynağında indirilen SRT'de altyazı satırları eksik kalır; videoda
  sessiz altyazı boşlukları görülür. Spec-uyumlu VTT (boş satırlı) etkilenmez —
  koşullu ama sessiz veri kaybı.
- **Deterministik yeniden üretim (probe, bu oturumda koşuldu):**

  ```text
  girdi (boş satırsız):  WEBVTT\n\n00:00.000 --> 00:01.500\nBirinci\n00:02.000 --> 00:03.000\nIkinci
  _vtt_to_srt çıktısı:   yalnız "Ikinci" cue'su (birinci düşer)
  parseTimedBlocks çıktısı (src/browser-subtitles.js): 2 cue — doğru
  ```

  Aynı içerik tarayıcı tarafındaki `parseTimedBlocks` ile 2 cue üretiyor; yani kayıp
  bu dönüştürücüye özgü tutarsızlık.
- **WebVTT notu:** Spec, cue'lar arasında boş satır ister ve cue metninde `-->`
  yasaklar; yani "`-->` içeren satır = yeni cue sınırı" varsayımı güvenlidir.
  Hata, geçersiz ama gerçekte görülen kompakt çıktılara karşı dayanıksızlıktır.
- **Önerilen düzeltme (uygulanmadı):** `-->` dalında yeni cue başlamadan önce mevcut
  `cur` `len(cur) > 1` ise `cues`'a eklensin (flush-on-boundary). Ölü `cur is not None`
  koşulu temizlenebilir.
- **Doğrulama planı:** Boş satırsız, boş satırlı, identifier'lı, çok satırlı metin ve
  `NOTE` bloklu fixture'larla birim test; `invidious:subs` uçtan uca regresyon.
- **Güven:** Yüksek (deterministik probe + statik akış doğrulaması).

## Kesin bulgu: R124-02 — `MAX_MEDIA_TIME_SECONDS` birim hatası (×1000)

- **Dosya/satır:** `src/browser-session-store.js:18` ve `src/browser-tab-history.js:7`
  — `const MAX_MEDIA_TIME_SECONDS = 60 * 60 * 1000;`
- **Kök neden:** Değer 3.600.000 **saniye** (~1000 saat / ~41 gün). `*1000` çarpanı
  milisaniye alışkanlığıyla yazılmış görünüyor; kullanıldığı alanlar
  `HTMLMediaElement.currentTime/duration` saniye cinsinden
  (`finiteNumber(v, 0, 0, MAX_MEDIA_TIME_SECONDS)` — `browser-session-store.js:223-224`,
  `browser-tab-history.js:37-38`). Yorum "değerler saniyedir" derken sabit ms formülü
  taşıyor.
- **Etki:** Amaç makul bir üst sınırsa (ör. ~1 saat) pratikte sınır yok denecek kadar
  gevşek: bozuk/kalıcı konum değerleri 1000 saate kadar kabul edilir. Sonlu ve
  pozitif kaldığı için çökme/veri kaybı yok — kullanıcıya görünür zarar pratikte yok.
- **Öneri:** `60 * 60` (1 saat) ya da gerçekten uzun yayınlar amaçlanıyorsa
  `60 * 60 * 24` gibi açık bir değer; sabit adı/yorumu netleştirilsin.
- **Güven:** Yüksek (sabit ve kullanım yerleri statik olarak doğrulandı).

## Tutarlılık notu: R124-03 — renderer/backend zaman-biçimi asimetrisi

- **Dosya/satır:** `src/renderer/renderer.js:1617` (`parseClipInput`) vs
  `backend/transcribe.py` `parse_timecode` (probe: `parse_timecode('1e3') == 1000.0`).
- **Durum:** Renderer regex'i `^\d+(:\d{1,2}){0,2}(\.\d+)?$` bilimsel gösterimi
  (`1e3`) ve 2 basamağı aşan ara grupları reddeder; backend `float()` üzerinden
  `1e3` gibi biçimleri kabul eder. UI'dan reddedilen değer backend'e ulaşamaz;
  CLI doğrudan çağrıda backend daha esnektir.
- **Etki:** Kullanıcıya görünür hata yok; yalnız sözleşme asimetrisi.
- **Öneri:** Tek kaynaklı zaman-grameri (örn. renderer regex'ini backend kabul
  kümesine hizalamak ya da tersi) düşünülebilir. Öncelik düşük.
- **Güven:** Yüksek (probe ile doğrulandı).

---

## İncelenip reddedilen adaylar (bulgu DEĞİL)

- **U+2060 (WORD JOINER) — `src/browser-subtitles.js:386`.** Regex'te görünmez
  karakter görülüyor: `.replace(/\\([{}])⁠/g, '$1').replace(/\\⁠/g, '\\')`.
  Git geçmişi (`8b9a526` — "harden browser subtitle capture and diagnostics") ve
  doğrudan ASS-parse probe'ı bunun **kasıtlı bir kaçış mekanizması** olduğunu
  doğruladı: `\{`, `\}` literal süslü parantez, `\\` literal ters-bölü olarak
  korunuyor; standart override etiketleri beklenen şekilde sökülüyor. Bulgu değil.
- **Ana süreç ↔ backend argüman push/declare karşılaştırması.** Otomatik karşılaştırma
  "push'lanan ama declare edilmeyen" ve "declare edilip push'lanmayan" listeler üretti;
  tek tek eşlemede bunların ayrı parser'lara (`media.py`, `invidious.py`,
  `youtube.py`, `transcribe.py`) ve koşullu yollara (`--chat-file`, env-taşımalı
  `WHISPER_*` sırları) ait olduğu görüldü. Bulgu değil — mimari gereği.
- **Eski/fuzz test başarısızlıkları.** Daha önceki oturumlarda görülen "FAIL"
  satırları kaldırılmış API yüzeylerine, değişen sözleşmelere ve bozuk fixture'lara
  yazılmış yanlış beklentilerdi; ürün regresyonu göstermiyorlar.
- **`wrap_text` genişlikte sarmıyor.** Probe `wrap_text('cok uzun ...', 10)` çıktısını
  sarılmamış gösterdi; ancak varsayılan `wrap_mode="sentence"` tasarım gereği cümle
  ortasında asla kırmıyor. Bulgu değil.
- **`srt_time` AttributeError.** Probe'da yanlış isim kullanıldı; gerçek fonksiyon
  `format_srt_time` (`transcribe.py:578`) ve NaN/sonlu/negatif denetimleri mevcut.
- **`transcribe:start` yetkilendirme/iptal yarışı.** `jobStarting` geçici bayrağı +
  `jobCancelSeq` defer'i spawn-öncesi iptal penceresini kapatıyor
  (`src/main.js:18033-18101`). Dayanıklı.
- **Kuyruk/olay süzgeci.** `queueItemId`/`jobId` uyuşmazlığı, terminal-sonrası geç
  `progress` reddi, kuyruk-kalıcılık-öncesi spawn ve ayar-dondurma doğrulandı.

## Bu oturumda koşulan testler/kanıtlar

- `npm test` — **tüm paket geçti** (Node test dosyaları + `test_translation_*` 198/198
  + Python `unittest` blokları; son satır: "Tüm testler geçti").
- `node -e` probeları:
  - `browser-subtitles.js::parseTimedBlocks` — boş satırsız, saatli, settings'li,
    identifier'lı, BOM'lu VTT varyantlarının hepsini doğru cue sayısıyla ayrıştırıyor.
  - ASS kaçış probe'ı — `\{`/`\}`/`\\` doğru davranıyor (R124 reddi).
- `backend/venv` Python probe'ı:
  - `parse_timecode` sınır/negatif/`nan`/`inf`/`1e3` davranışları haritalandı.
  - `_vtt_to_srt` kompakt-VTT cue kaybı (R124-01) deterministik olarak gösterildi.
- Statik inceleme: `transcribe.py` boru hattı sonu/yazıcılar, `main.js`
  `resolvePython`/`recordJob`/`transcribe:start`, `renderer.js`
  `attachCompletedJobSubtitles`/`locateMissingSubtitle`, `browser-subtitles.js`
  tamamı (SRT/VTT/ASS/SAMI/LRC/TTML/DASH/HLS/MP4 parser'ları, sınırlar),
  `browser-media-controller.js` (ses grafiği, SPA dayanıklılığı, reklam algılama),
  `browser-session-store.js`, `browser-translation-scheduler.js`, `media.py`,
  `youtube.py`, `pipeline_control.py`, kurulum/güncelleyici akışı.

## Uygulama planı (öneri — kod değişikliği bu turda yok)

1. **R124-01 (önce bu):** `_vtt_to_srt` içinde `-->` dalında mevcut `cur`'ı flush et;
   kompakt/identifier'lı/çok-satırlı/NOTE fixture'larıyla regresyon testi ekle;
   `invidious:subs` yolunu uçtan uca doğrula.
2. **R124-02:** Sabiti `60 * 60` yap (ya da amaçlanan üst sınırı açıkça yaz); iki
   dosyada da senkron tut; `finiteNumber` sınır testlerini gözden geçir.
3. **R124-03 (düşük):** İki tarafın zaman-gramerini tek sözleşmede topla ya da
   renderer regex'ini backend kümesine genişlet; UI ipucunu güncelle.

## Sınırlar / doğrulanamayanlar

- Gerçek YouTube hesabı/Invidious instance'ı canlı doğrulaması yapılmadı; fixture ve
  mock kanıtları canlı sağlayıcı başarısının kanıtı değildir.
- Widevine/DRM, GPU transkripsiyon ve gerçek Windows `start.bat` kabulü bu oturumda
  koşulmadı.
- Tam-suite Electron UI smoke'ları (`tests/run-electron-smokes.js`) ayrı koşulur;
  bu turda hedefli bridge smoke'u ve birim/entegrasyon paketi kullanıldı.
