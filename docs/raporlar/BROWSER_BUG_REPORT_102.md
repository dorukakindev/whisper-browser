# BROWSER_BUG_REPORT_102 — T5: Çökme, Veri Bütünlüğü ve Performans Gauntlet'i

- **Tarih:** 2026-09-22 (Europe/Istanbul)
- **Dal:** `devin/t5-crash-integrity`
- **Başlangıç SHA:** `4453ae0` (origin/master)
- **Bitiş kod SHA:** `ea7f547`
- **Kapsam:** Altı görevden beşincisi — altyazı yakalama, çeviri, asset store ve oturum yazımının her kritik write/rename/close aşamasına deterministik hata enjeksiyonu; hasarlı profil → gerçek Electron yeniden açılışı; 10 bin cue + çok sekme + eşzamanlı çeviri altında p95/p99 UI takılması, bellek ve dosya büyümesi.

## Enjeksiyon dikiği (değişen dosyaların gerekçesi)

| Dosya | Değişiklik | Neden |
|---|---|---|
| `src/browser-cea-checkpoint.js` | `saveCeaCheckpoint`/`loadCeaCheckpoint` → `fsImpl` parametresi | CEA 608/708 checkpoint yazımı modül düzeyinde fs kullanıyordu; enjekte edilemez tek write yoluydu. |
| `src/browser-series-context.js` | `createBrowserSeriesContext({filePath, fsImpl})` | Dizi bağlamı commit/read yolu aynı gerekçeyle. |
| `src/browser-feature-services.js` | `deps.fsImpl` → `fsx` (`save()`, `writeOwnedSubtitle()`, `data()`, series store'a geçirilir) | Skip-segments ve sahip olunan altyazı yazımları main.js'in kritik write yollarından. |
| `src/browser-note-store.js` | `readDocument`/`load`/`flush` catch içi `fs.` → `this.io` | Enjeksiyon dikiği tutarsızlığı: flush `options.io` kullanırken okuma/temizleme modül fs'i kullanıyordu. Üretimde io===fs (davranış aynı). |
| `src/main.js` | `writeSubtitleAtomic`/`writeJsonAtomic`/`writeBufferAtomic` → sonda `io = fs` | Oynatıcı altyazı/JSON/buffer yazıcıları enjekte edilemez modül-düzey fs kullanıyordu; dikiş açıldı. |
| `tests/history.test.js`, `tests/watch-library.test.js` | Kaynak-slice marker'ı `'function writeJsonAtomic('` | İmza genişledi; marker yalnız işlev başlangıcını buluyor — assertion anlamı aynı. |
| `tests/validation.test.js` | regex `fs\.unlinkSync\(tmp\)` → `io\.unlinkSync\(tmp\)` | Catch bloğu artık enjekte io üzerinden temizliyor; assertion (tmp temizlenmeli) aynen korundu. |

## Gerçek bulgular

### F-102-1 — Yetim `.tmp` kalıntısı (FAIL-FIXED)

- **Konum:** `src/browser-reading-list.js` `_writeIndex` (51-63), `src/browser-element-rules.js` `_write` (46-58).
- **Ulaşılabilir yol:** `commit()`/`add()`/`remove()`/`clear()` → `_writeIndex`/`_write` → `writeFileSync(temp)` → `renameSync(temp→hedef)` patlarsa temp dosya yerinde kalıyor. Kardeş depoların (note-store, session-store, asset-store, series-context) tümü try/finally ile temizliyor.
- **Önce kırmızı test:** `tests/crash-integrity.test.js` Bölüm G — `renameSync` enjeksiyonu sonrası `tmpFiles(dir).length === 0` iddiası `1 !== 0` ile kırmızıydı.
- **Düzeltme:** iki fonksiyona try/finally tmp temizliği.
- **Sonra kanıt:** aynı matris yeşil; `npm test` tam suite yeşil.
- **Kullanıcı etkisi:** düşük — disk kirliliği + ileride sweep mantığına gereksiz yük; indeks tutarlılığı zaten korunuyordu (rename atomik, eski nesil bozulmaz).

### F-102-2 — `requestIsCurrent` destroyed-webContents TypeError (FAIL-FIXED)

- **Konum:** `src/main.js` `resumeRestoredBrowserPage` → `requestIsCurrent` (~12095).
- **Ulaşılabilir yol:** kurtarılan sekme sayfa yüklerken işlem/webContents yok edilirse (kullanıcı sekmeyi kapatır, uygulama kapanır) `view.webContents` undefined döner → `.isDestroyed()` TypeError → işlenmeyen Promise reddi; `tab.lifecycle='restore_failed'` güncellemesi atlanır.
- **Repro:** `tests/electron-crash-integrity.smoke.js` ilk koşusunda gerçek Electron'da düzeltme öncesi `TypeError: Cannot read properties of undefined (reading 'isDestroyed')` işlenmeyen rejection olarak gözlendi.
- **Düzeltme:** `view.webContents &&` null kontrolü.
- **Sonra kanıt:** aynı smoke yeniden koşuldu — rejection yok, 9/9 check PASS.
- **Kullanıcı etkisi:** düşük-orta — log gürültüsü + kaçan lifecycle güncellemesi; veri kaybı yok.

## Kabul matrisi

| Alan | Sonuç |
|---|---|
| Atomik yazarlar (atomic-json, burnin) write/rename enjeksiyonu | PASS — {v:1} korunur, tmp temizlenir, backup geri konur |
| Session store write/rename + corrupt-primary→.bak kurtarma | PASS |
| Asset store putTrack iki-aşama write/rename + sweep (bayat silinir, taze korunur) | PASS |
| Translation cache flush (async fs.promises yolu) + corrupt→.bak + çift-bozuk→.corrupt-* arşiv | PASS |
| Translation archive index enjeksiyonu → eski nesil korunur, yeni kayıt indekse girmez | PASS |
| Note store upsert/.bak-ayna enjeksiyonu + .bak kurtarma + çift-bozuk loadError durdurması | PASS |
| Reading list + element rules enjeksiyonu | PASS (F-102-1 düzeltildi) |
| Series context + CEA checkpoint + secret store | PASS |
| Yanlış-nesil karışması (gen1→gen2 yarım→gen3 tamam) | PASS |
| Gerçek Electron hasarlı-profil açılışı (9 check) | PASS |
| Perf: 10k cue + 3 sekme + eşzamanlı çeviri | PASS (ölçümler aşağıda) |

## Nicel sonuçlar (gerçek Electron, `.uiprev/perf-gauntlet/`)

- `renderCueList` 10.000 cue: **16 ms**, render edilen DOM düğümü **500** (sayfalama 500/sayfa — PF sınırı belgelenmişti), longtask p95/max = **0 ms**.
- Eşzamanlı çeviri + render döngüsü + sekme geçişleri sırasında: longtask p95/p99/max = **0/0/0 ms**, rAF p95/p99 = **17 ms** (60fps bütçesi ~16.7ms).
- Sağlayıcı çağrısı: **13** (10k cue → cümle birleştirme grupları; scheduler çalışmaya devam ediyordu — liveResults=0 anlık görüntü).
- Bellek: başlangıç 617 MB → son 741 MB (**Δ124 MB**, 10k cue + 3 sekme + çeviri yükü altında; tek ölçüm — sızıntı iddiası kurulmaz).
- Dosya büyümesi (userData): **+49 KB**.
- Crash smoke: bayat .tmp süpürüldü, taze .tmp korundu, bozuk birincil oturum .bak'tan kurtarıldı ve birincil dosya yeniden yazılarak onarıldı, `cleanExit:false` → kullanıcıya "beklenmedik kapanış" uyarısı.

## Çalıştırılanlar / çalıştırılamayanlar

- Çalıştı: `npm test` (tam suite, tüm dosyalar geçti), `npm run test:electron-bridge` (PASS), `tests/crash-integrity.test.js`, `tests/electron-crash-integrity.smoke.js` (PASS 9/9), `tests/electron-perf-gauntlet.smoke.js` (PASS 6/6).
- Çalıştırılmadı: gerçek işlem-ölümü (kill -9) yerine deterministik fs enjeksiyonu + hasarlı profil yeniden açılışı kullanıldı — timing-yarışsız eşdeğer kapsama. Uzun soak koşusu R96'da zaten geçti (4000 döngü/34 dk); tekrarlanmadı. Windows ortamı mevcut değil.
- Yeni bağımlılık: yok.

## Yanlış-pozitif kontrolü

- PF1/PF2/PF3 sınırları (fingerprint 8.4ms @20k, session write 312ms schema-max, cuesToSrt 88ms) yeni bug olarak raporlanmadı; renderCueList sayfalama davranışı mevcut kodla karşılaştırıldı (500/sayfa → 16ms render beklenen davranış).
- `settings.json.<pid>.tmp` yetiminin açılışta kaldırılmaması doğru davranış — başka işlemin canlı yazısı olabilir; smoke'ta "izole kaldı" olarak doğrulandı, bug sayılmadı.
- Reading-list orphan page dosyaları (indeks patlarsa) bilinçli koruma: yanlış nesil indekse işlenmez; dosya yetim kalır ama tutarlılık öncelikli — sözleşme belgelendi.

## Açık sınırlar

- `main.js` atomik yazarlarının `io` dikiği modül seviyesinde — Node testleri main.js'i eval etmeden doğrudan bu yolları enjekte edemez; aynı sözleşme `atomic-json.js` üzerinden kapsandı.
- safeStorage şifreli depo (secret-store) gerçek platform kasasıyla doğrulanmadı — smoke fake safeStorage kullandı.
