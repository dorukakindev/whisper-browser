# REPRODUCE — DEEPSEEK-NIGHT1000-20261027T0441Z

Bu dosya, 1.000 senaryoluk denetimin Windows'ta nasıl yeniden üretileceğini anlatır. Komutlar Git Bash değil **PowerShell** içindir. Tüm yollar `D:\Whisper Local` deposuna göredir.

## 0. Bağımlılıklar (kurulum gerekmedi)

| araç | sürüm / yol | kullanım |
|---|---|---|
| Node | v25.6.1 | JS probları ve mevcut node testleri |
| Python | 3.11.9 (`backend\venv\Scripts\python.exe`) | backend probları |
| Python (runner) | 3.14 (PATH'teki `python`) | `probes\run.py` ve sürücüler |
| Electron | 43.5.0 (`node_modules\electron\dist\electron.exe`) | gerçek smoke'lar |
| ffmpeg | `C:\ffmpeg\bin\ffmpeg.exe` ve `backend\bin` | yalnız mevcut book-export testi |
| jsdom | depoda mevcut node_modules | DOM probları |

Ek kurulum yapılmadı; ayrıntı `TOOLS.md`.

## 1. Ortak değişkenler

```powershell
$ROOT = "D:\Whisper Local"
$RUN  = Join-Path $ROOT "docs\raporlar\DEEPSEEK-NIGHT1000-20261027T0441Z-n1k7"
$PY   = Join-Path $ROOT "backend\venv\Scripts\python.exe"
$NODE = "node"
Set-Location $ROOT
```

## 2. Tek satır koşucusu (tüm paketler)

`probes\run.py` alt komutu çalıştırır, stdout/stderr'ı `logs\TpkgNN-<id>.*` altına yazar ve `RUN-LOG.jsonl`'a gerçek çıkış kodunu işler.

```powershell
python "$RUN\probes\run.py" --task pkg05 --id N0441 --desc "dublaj kurtarma" -- $PY "$RUN\probes\p23-dub-resume.py" --mech normal
```

JS probu için:

```powershell
python "$RUN\probes\run.py" --task pkg08 --id N0744 --desc "relink unicode" -- node "$RUN\probes\p38-relink.js" --mech unicode
```

Çıktı biçimi: `[pkg05-N0441] exit=0 timed_out=False ...`; ayrıntı `logs\Tpkg05-N0441.stdout.txt` ve `logs\Tpkg05-N0441.stderr.txt`.

## 3. Paket bazında toplu yeniden üretim

### pkg01–pkg03 (F01–F15)

Bu paketlerde tek sürücü yok; satırlar `probes/f01-*.js` … `f15-*.js` ve `p16` öncesi Python problarıyla tek tek koşuldu. Satır mekanizması CSV'nin `mechanism` sütunundadır.

```powershell
# örnek: pkg01 N0001 (F01, mech=normal)
python "$RUN\probes\run.py" --task pkg01 --id N0001 --desc "F01 normal" -- node "$RUN\probes\f01-ownership.js" --mech normal

# probe-results.json -> CSV + pkgNN/TASK-MATRIX.csv (yalnız o batch)
python "$RUN\probes\apply.py" 01
```

Mevcut testler / Electron smoke'ları (isteğe bağlı, gerçek harness):

```powershell
node --test tests/assistant-agent-service.test.js
node --test tests/assistant-flows.test.js
node --test tests/assistant-capabilities.test.js
node --test tests/assistant-provider.test.js
node --test tests/assistant-threads.test.js
node tests/run-electron-smokes.js assistant-agent
node tests/run-electron-smokes.js assistant-conversation
node tests/run-electron-smokes.js assistant-evidence
node tests/run-electron-smokes.js assistant-library
node tests/run-electron-smokes.js assistant-flows
node tests/run-electron-smokes.js assistant-page
```

### pkg04–pkg06 (F16–F30)

```powershell
python "$RUN\probes\drive.py" --pkg 04 --config "$RUN\probes\pkg04-config.json" --dry
python "$RUN\probes\drive.py" --pkg 04 --config "$RUN\probes\pkg04-config.json"
python "$RUN\probes\drive.py" --pkg 05 --config "$RUN\probes\pkg05-config.json"
python "$RUN\probes\drive.py" --pkg 06 --config "$RUN\probes\pkg06-config.json"
```

`--dry` yalnız komutları yazdırır. Tek satır için `--only N0441,N0459` eklenebilir.

### pkg07–pkg10 (F31–F50)

```powershell
python "$RUN\probes\drive_pkgs.py" --pkg 07 --config "$RUN\probes\pkg07-config.json" --dry
python "$RUN\probes\drive_pkgs.py" --pkg 07 --config "$RUN\probes\pkg07-config.json"
python "$RUN\probes\drive_pkgs.py" --pkg 08 --config "$RUN\probes\pkg08-config.json"
python "$RUN\probes\drive_pkgs.py" --pkg 09 --config "$RUN\probes\pkg09-config.json"
python "$RUN\probes\drive_pkgs.py" --pkg 10 --config "$RUN\probes\pkg10-config.json"
```

pkg07–08 için `finalize_pkgs.py`, pkg09–10 için `finalize_pkgs_09_10.py` rapor/matris/ZIP üretir (isteğe bağlı; bu paketleme oturumu çalıştırmadı):

```powershell
python "$RUN\probes\finalize_pkgs.py"
python "$RUN\probes\finalize_pkgs_09_10.py"
```

## 4. Bulgu başına en kısa yeniden üretim

```powershell
# B05-01: tüm parçalar hazırken DUB_WARNING incomplete_audio
python "$RUN\probes\run.py" --task pkg05 --id N0441 --desc "B05-01" -- $PY "$RUN\probes\p23-dub-resume.py" --mech normal

# F33-01: bölüm wav'ı silinmiş M4B dışa aktarma
python "$RUN\probes\run.py" --task pkg07 --id N0659 --desc "F33-01" -- node "$RUN\probes\p33-book-m4b-metadata.js" --mech kullanici-geribildirimi

# F38-01: Türkçe İ katlaması
python "$RUN\probes\run.py" --task pkg08 --id N0744 --desc "F38-01" -- node "$RUN\probes\p38-relink.js" --mech unicode

# F39-01: kesik Letterboxd CSV
python "$RUN\probes\run.py" --task pkg08 --id N0772 --desc "F39-01" -- $PY "$RUN\probes\p39-letterboxd-csv.py" --mech kesik

# F09-01: TR arayüzde ham İngilizce keşfet hatası
python "$RUN\probes\run.py" --task pkg09 --id N0837 --desc "F09-01" -- node "$RUN\probes\p42-media-search-home.js" --mech yetki

# F09-02: bozuk gizli kasa
python "$RUN\probes\run.py" --task pkg10 --id N0999 --desc "F09-02" -- node "$RUN\probes\p50-settings-secret-atomic.js" --mech kullanici-geribildirimi
```

Beklenen: B05-01, F33-01, F38-01, F39-01, F09-01 ve F09-02 için prob **hatalı davranışı gösteren** çıktı üretir (exit 0 olabilir; prob kendi assertion'ını yazar). `FINDINGS.json` içindeki `repro.command` alanları birebir koşu komutlarıdır.

## 5. Temizlik (yalnız kendi geçici dosyaların)

```powershell
# probların ürettiği geçici klasörler (varsa)
Remove-Item -Recurse -Force "$env:TEMP\deepseek-night1000-*" -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force "$RUN\probes\__pycache__" -ErrorAction SilentlyContinue

# Bu paketleme oturumunun ürettiği ara dosya yoktur; run klasörü silinmemelidir.
```

`D:\Whisper Local\.uiprev` deponun kendi smoke harness'ının çıktısıdır ve bu denetim tarafından silinmemelidir. Kişisel profil, `settings.json`, `history.json`, gizli kasa ve medya dosyalarına dokunulmadı.

## 6. Beklenen çıktılar

- `logs\TpkgNN-<id>.stdout.txt` / `.stderr.txt` — satır kanıtı
- `RUN-LOG.jsonl` — `command`, `cwd`, `exit_code`, `timed_out`, `utc_start/end`, `duration_s`
- `pkgNN\probe-results.json` — satır başına durum/çıktı
- `pkgNN\TASK-MATRIX.csv` — paket matrisi
- `TASK-MATRIX.csv` — 1.000 satırlık birleşik matris (bu paketleme oturumunda üretildi)
