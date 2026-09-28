# BROWSER_BUG_REPORT_148 — R171 Windows doğrulama oturumu bulgularının düzeltilmesi

Tarih: 2026-09-27 · Dal: `codex/r171-windows-findings-1790594900` · Kod commit: `9b6b04c`

## Kaynak

`ed0f551b...` Windows doğrulama child oturumu (Windows Server 2022, GPU'suz)
4 kullanıcı-yüzlü bulgu bıraktı. Bu rapor her birinin doğrulaması ve
uygulanan düzeltmeyi belgeler.

## Bulgular ve karşılıkları

### B1 — `requirements.txt` ctranslate2 açık tabanı kırık sürüme gidiyor (DÜZELTİLDİ)

Oturumda elle `pip install faster-whisper yt-dlp` yapıldığında pip
ctranslate2 **4.8.2**'yi çözdü ve `WhisperModel(...)` init'te
**0xC0000005 access violation** verdi; lock'taki `ctranslate2==4.4.0`'a
inilince çalıştı. `install.bat` zaten `requirements-core.lock` (pin'li)
kullanır — riski taşıyan dosya `backend/requirements.txt` idi:
`ctranslate2>=4.4.0` açık taban elle/manuel kurulumda aynı çöken sürümü
çözer. `==4.4.0`'a pinlendi (kanıtlanmış sürüm, lock'la aynı).

### B2 — çözen paket/DLL sorunu kurulumda değil ilk kullanımda patlıyor (DÜZELTİLDİ)

Aynı oturumda onnxruntime `vcruntime140_1.dll` eksikliğinden import
olamıyordu (vc_redist.x64 sonradan kuruldu). Kurulumun `pip install`
adımı başarılı sayılsa bile wheel'lar bozuk sistemde çöküyor — ilk
transkripsiyonda şifreli hataya dönüyor.

- `tools/install-orchestrator.js`: `CORE_INSTALL` sonrası
  `import ctranslate2, faster_whisper` smoke'u (`IMPORT_SMOKE`) eklendi;
  pin dışına kayan çözüm veya eksik DLL kurulum anında görünür.
- `install-browser-tools.bat`: pip sonrası `import onnxruntime` kontrolü;
  başarısızsa `vc_redist.x64` bağlantısıyla net mesaj + pause.

### B3 — GPU'suz makinede rozet "CUDA · float16" gösteriyor (DÜZELTİLDİ)

`env.gpu` null (nvidia-smi yok/yanıt yok) iken `device` select 'cuda'da
kalıyor ve rozet "CUDA · float16" gibi duruyordu; arka uç
`resolve_device_and_compute` zaten cpu'ya düşürüyor (backend davranışı
doğru) ama UI yanlış beklenti veriyordu. `renderer.js`: GPU bulunamadığında
select 'auto'ya çekilir + warn log; kayıtlı kullanıcı tercihi ezilmez
(persist edilmez — geçici sürücü sorununda 'cuda' tercihi korunur).

### B4 — install.bat preflight Node/Python kapısı (BUG DEĞİL — bilinçli kapı)

Oturum Node 20.19 ve Python 3.12.8 ile başladı; orchestrator
`NODE_VERSION` (≥22.13) ve `PYTHON_VERSION` (3.10/3.11) kapılarıyla
durdu — istenen davranış. Gevşetme yapılmadı: `package.json` engines
ve kilitli toolchain bu sürümleri gerektiriyor; hata mesajı doğru sürümü
söylüyor.

### B5 — ffmpeg repoda yok (BUG DEĞİL — net hata yolu var)

`backend\bin\ffmpeg.exe` paketlenmiyor; orchestrator `FFMPEG_MISSING`
ile duruyor ve hem `backend\bin` hem PATH seçeneklerini söylüyor.
Sistem PATH'indeki ffmpeg ile çalıştığı doğrulandı. Sessiz boşluk yok.

## Testler

- `node --check` renderer.js + install-orchestrator.js temiz
- `tests/install-supply-chain.test.js` → 50 senaryo geçti (FakeDriver
  `installIntoVenv`'i override eder — yeni run çağrısı gerçek sürücüde)
- `tests/ui-locale.test.js` 14/14, `tests/player-ui.test.js` 152/152
- `install-browser-tools.bat` değişikliği .bat sözdizimi (rem/if/exit) —
  Windows'ta elle doğrulanmalı

## Doğrulanmamış sınırlar / Windows etkisi

- `IMPORT_SMOKE`/`import onnxruntime` yolları yalnız Windows .bat/
  orchestrator'ında koşar; Linux CI'da import kontrollerinin kendisi
  koşamaz (platform paketi farkı). Windows'ta install.bat ve
  install-browser-tools.bat'ın uçtan uca tekrarı önerilir.
- GPU'suz makinede rozet/select davranışı gerçek Windows'ta el kontrolü
  ister (Linux kutuda nvidia-smi zaten yok — kod yolu doğru ama UI
  onayı görsel).
