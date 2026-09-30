# BROWSER_BUG_REPORT_258 — R309: yt-dlp güncelleme sonrası rollback bütünlüğü

- Tarih: 2026-09-30
- Kapsam: 20'lik kuyruk maddesi 12 — yt-dlp güncelleme sonrası geri-dönüş bütünlüğü.
- Dal: `devin/1790747379-ytdlp-rollback-depth` (master `78008c0` üzerine)

## Denetim yöntemi

`backend/update_ytdlp.py` (546 satır) tam okundu: staging transaction, wheel doğrulama,
`validate_runtime` (izole `-I` import + sürüm eşleşmesi), `_atomic_write_json` pointer
yazımı (fsync + os.replace), `prune_packages` (keep = aktif + previous, en çok 3 sürüm),
`update_lock` (PID + token), `cleanup_stale_staging`. JS tarafında `src/ytdlp-runtime.js`
`activeRuntimePath`/`pythonEnvWithRuntime` ve `maintenance:updateYtdlp` handler'ı incelendi.
Mevcut `backend/test_ytdlp_update.py` (400 satır, 26 test) atomiklik/kilit/prune
senaryolarını zaten kilitliyor.

## Bulunan bug ve düzeltme

**Yarım silinmiş paket bozuk dizin olarak döndürülüyordu.**

`activeRuntimePath` bir paket dizinini yalnız `yt_dlp/__init__.py` varlığıyla
"kullanılabilir" sayıyordu. Antivirüs karantinası ya da yarım kalan prune, `version.py`yi
silip `__init__.py`'yi bırakırsa pointer bozuk dizini döndürür, `PYTHONPATH` ona işaret
eder ve `from yt_dlp.version import __version__` import hataya düşerdi — `previous`
geri-dönüşü tetiklenmez, venv yedeğine de inilmezdi.

Düzeltme: `activeRuntimePath` artık `__init__.py` yanında `yt_dlp/version.py` de istiyor
(validate_runtime'ın gerçekten import ettiği modül). Bozuk aktif sürüm `previous`'a,
ikisi de bozuksa venv'e düşülür.

## İncelenip temiz çıkan yollar

- `active.json` pointer'ı fsync + `os.replace` ile atomik; yarım okuma imkânsız.
- `prune_packages` keep kümesi aktif+previous — ikisi de silinemez; en çok 3 sürüm.
- Yeni pointer yazımı başarısızsa `committed=False` → yeni paket dizini silinir, eski
  pointer dokunulmaz (tam geri dönüş).
- `update_lock`: PID sahipliği + token eşleşmesi; ölü sahibin kilidi geri alınır.
- Bozuk `active.json` (parse edilemeyen) → `''` → venv yedeği (sessiz ama tutarlı).
- `previous` tek seviye — MAX_PACKAGE_VERSIONS=3 sınırının parçası, tasarım gereği.

## Doğrulama

- `node tests/ytdlp-runtime.test.js` → PASS; yeni senaryolar: bozuk aktif → previous,
  bozuk previous → venv.
- **Kırmızı kanıtı:** eski `ytdlp-runtime.js` ile aynı test FAIL (`bozuk aktif sürümde
  önceki sürüme düşülmedi`).

## Windows etkisi

`resolveInside` zaten `..`/mutlak-yol kaçışlarını reddediyor; yeni existsSync sorgusu
platform bağımsız. Gerçek AV-karantina senaryosu Windows'ta elle doğrulanmadı.
