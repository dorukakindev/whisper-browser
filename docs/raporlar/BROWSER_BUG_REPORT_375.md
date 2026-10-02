# BROWSER_BUG_REPORT_375 — Yeni-100 batch 2: Windows-hazırlık derinleştirme

Tarih: 2026-10-02 · Dal: `devin/<ts>-new100-b2-windows` · Başlangıç: `ebc204b`

## Kapsam

Maddeler 11–20 — Windows'a özgü davranışların, önceki turda (R107, batch-9,
unicode-paths, windowsSafeFileName fuzz) kapsanmayan kısımlarının denetimi.
Her madde: önce mevcut davranış sınandı → doğrulanmış kusur düzeltildi veya
kanıtla kapatıldı.

## Bulgular

### DÜZELTİLDİ

| # | Kusur | Kök neden | Düzeltme |
|---|-------|-----------|----------|
| 11 | UNC ağ paylaşımındaki medya oynatıcıda açılmıyor | `pathToFileUrl('\\\\sunucu\\paylas\\x')` → `file:///sunucu/paylas/x`: baştaki `/+` sileci sunucu adını yetki (host) bölümünden yola katlıyordu; URL yerel `C:\sunucu\paylas\x`'e çözülüyordu | UNC girişinde `file://sunucu/...` (host korunur); `tests/path-to-file-url.test.js`'te hostname+pathname kilitli |
| 12 | `?` içeren dosya adı URL sorgu sınırı üretiyordu | `encodeURI` `?`'yi kodlamaz; `file:///x?y.mp4` → `y.mp4` sorgu dizisi sanılıyor | `?` → `%3F` eklendi (UNC ve yerel kol) |
| 13 | `ENAMETOOLONG` dostça mesaja çevrilmiyordu | `status-copy.js` kural tablosunda kural yoktu; derin klasörde hata ham İngilizce `ENAMETOOLONG: name too long` olarak yüzeye çıkıyordu | `enametoolong|name too long|path too long` kuralı TR+EN eklendi; err-coverage-ratchet 332 kontrol PASS |
| 18 | `windowsHide` yalnız çağrı anımsanmasına bağlıydı | 18/50 spawn noktasında açık `windowsHide: true`; gelecekte unutulan bir çağrı Windows'ta boş konsol penceresi bırakır | `spawn`/`spawnSync` sarmalayıcısında `windowsHide ?? (process.platform === 'win32')` yapısal varsayılan; `tests/spawn-wrapper-defaults.test.js` (7 kontrol) |

### KANITLA KAPATILDI (kusur yok)

| # | Madde | Kanıt |
|---|-------|-------|
| 14 | Kuyruk dedupe büyük/küçük harf | `queueInputKey` `\\`→`/` + `..`/`.` katlama + `toLowerCase()`: `D:\Video\CLIP.MP4` ≡ `d:\video\clip.mp4` (renderer.js:442) |
| 15 | İzleme klasörü dedupe | `watchSeen.get(canonicalFsPath(filePath))` — win32'de lowercase (main.js:2605,2441) |
| 16 | `\\?\`/`\\.\` aygıt yolu reddi | `canonicalLocalPath` `/^\\\\[?.]\\/` reddeder; normal UNC kabul (local-file-access.js:10) |
| 17 | Antivirüs/Search-indeks kilit dayanıklılığı | `RENAME_RETRY_CODES` = EPERM/EACCES/EBUSY, 10 deneme ×25ms (fsync-utils.js:18) |
| 19 | `resolvePython` Windows yedeği | `backend/venv/Scripts/python{,3}.exe` → `python`/`py`/`python3` probu (main.js:19666) |
| 20 | GPU/VRAM tespiti | `nvidia-smi --query-gpu=name,memory.total` CSV + `vramMib` (main.js:18329) |

## Test kanıtı

```
tests/path-to-file-url.test.js       PASS 11/11 (3 yeni kilit)
tests/spawn-wrapper-defaults.test.js PASS 7 kontrol (yeni)
tests/err-coverage-ratchet.test.js   PASS 332 kontrol
node --check src/main.js + renderer.js + status-copy.js — temiz
```

## Windows etkisi

Doğrudan Windows'a özgü 3 düzeltme: UNC paylaşım (NAS/SMB medya), `?` POSIX
dosya adı (Linux/mac), ENAMETOOLONG uzun-yol hatası (derin `D:\...` klasörü),
windowsHide varsayılanı (gelecekteki spawn çağrıları). Gerçek Windows'ta
yalnız UNC oynatımı elle doğrulanabilir — Ubuntu'da `file://` davranışı
birim-düzeyinde kilitlendi.

## Notlar

- `?` dosya adı Windows'ta yasaklıdır; düzeltme POSIX yolları içindir —
  Windows etkisi yoktur ama sözleşme doğru URL üretimidir.
- `\\?\`/`\\.\` girdileri zaten `canonicalLocalPath`'te reddedildiği için
  `pathToFileUrl`'in `\\?\...` üretmesi erişilemez bir daldır.
