# BROWSER_BUG_REPORT_367 — 100-kuyruk batch 5: master suite onarımı (12 bayat sözleşme/stub + CSS token uyumu)

## Kapsam

Batch 5 (madde 41–50, güvenlik/IPC tur-2) başlangıcında temiz master `82acbe3` üzerinde `npm test` koşturuldu: **12 dosya düşüyordu**. Tümü incelendi; doğrulanmış ürün bug'ı **yok** — her biri önceki batch'lerin kasıtlı sözleşme değişikliklerinin test tarafına yansımamış kalıntısıdır (VM-slice ctx stub'ları, statik-regex ratchet'leri, kayıtlı izin listesi satır numaraları, sözleşme-yenilenen kasa testleri). Bulgular kaynağa karşı doğrulanıp test tarafı yeni sözleşmeyi kilitleyecek şekilde güncellendi; ürün koduna tek dokunuş `styles.css` token uyumudur.

## Düşen dosyalar ve kök nedenler

| Dosya | Kök neden | Düzeltme |
|---|---|---|
| browser-safety-controls | #392 redirect-hardening: `session.fetch(parsed.href)` → `session.fetch(requestUrl, {redirect:'manual'})` + hop-başına doğrulama; statik regex bayat | Regex yeni sözleşmeyi kilitler: `requestUrl` + `redirect:'manual'` + 50MB sınırı |
| core-security-r4 | Aynı #392 değişikliği favicon zincirinde: tek `crossOrigin` kontrolü → her hop'ta `sameOriginAsPage` + `assertPublicBrowserSubtitleUrl` | İki regex ile yeni sözleşme kilitlendi (hop doğrulaması + manual redirect) |
| security-media-learning | #393 vault kurtarma: kısmen çözülen kasa artık reddedilmez — kırık kayıt `rawEntries` olarak korunur, yeni kayıt yazılır | Test yeni sözleşmeyi kilitler: `ok:true`, kırık kayıt ham haliyle, sağlam kayıt yeniden şifreli, temizleme çalışır |
| pure-modules-deadzone (t_secret_store) | Aynı #393 sözleşmesi; `load()` kısmi kasada `ok:false+partial:true` döndürür | saveFromSettings başarı beklentisi + ham-kayıt korunması + yeniden yükleme kısmi işareti |
| browser-subtitle-actions | `restoreBrowserTranslationSnapshot`/`loadSubtitle` içine `invalidateTimelineEdits()` çağrısı eklendi; VM-slice ctx'te stub yok | ctx'e `invalidateTimelineEdits() {}` eklendi |
| browser-subtitle-selection | Aynı | Aynı stub eklendi |
| capture-export-deadzone | #394 diagnostics `system:` bloğu `app.getVersion()/getLocale()` + `browserGpuDiagnostics` kullanır; app stub'ı eksik | Stub'a `getVersion`, `getLocale`, `browserGpuDiagnostics:null` eklendi |
| disk-full | batch-4 fsync zinciri: `writeBufferAtomic` artık `fsyncDirectory` çağırıyor | ctx'e gerçek `fsyncDirectory` (toleranslı) eklendi |
| dom-innerhtml-ratchet | `ALLOWED` izin listesi `dosya:satır::ifade` kilitler; renderer büyümesi 12 girdiyi kaydırdı (603→604 …, 21086→22011) | İzin girdileri yeni satır numaralarına güncellendi; ifadeler kaynakta hâlâ aynı |
| live-asr-fallback | canlı-ASR diliminde `createLiveAsrAudioSwitch` çağrısı (main.js:9090); VM ctx eksik | ctx'e gerçek modül bağlandı |
| soak-deadzone (t_cea_full_start) | madde-28 kaynak bütçesi: `startBrowserHlsCeaFullCapture` artık `jobResourceScheduler.enqueue` çağırıyor | ctx'e `{gpu:1,cpu:2,network:4,disk:4}` limitli gerçek scheduler bağlandı |
| css-hardcoded-colors | 436 > 430 baseline — yeni kurallar token yerine fallback literal taşıyordu | `--warn, #e4a36a`→`--warning` (×2), `var(--ok, #4caf7d)`→`var(--success)` (×3), `rgba(213,163,92,.3)`→`color-mix(in srgb, var(--accent) 30%, transparent)` |
| atomic-write-kill | `Math.random` ile öldürme ofseti — ci-determinism-ratchet yasağına takıyor + nondeterministik | 45–160ms penceresinde 37-adımlı eş-asal round-robin (tüm ofsetler deterministik dolaşılır) |

## Kaynak doğrulamaları (sözleşme değişikliği kasıtlı mı?)

- **#392** (`49dc727`): image/favicon/RSS indirme yolu hop-başına doğrulanan manual-redirect zincirine çevrildi — tek-kontrol sözleşmesinden **daha güçlü**; testin yeni sözleşmeyi kilitlemesi doğru yön.
- **#393** (`a968577`): `SafeSecretStore.save()` `rawEntries`'i verbatim korur; `saveFromSettings` yalnız hiç kurtarılabilir kayıt yoksa (sert-bozuk) reddeder. Kısmi kasada kullanıcı kilitlenmez.
- **#394** (`d2c28f6`): diagnostics export `system:` bloğu kasıtlı eklendi (`platform/arch/appVersion/versions/locale/gpu`).
- **`invalidateTimelineEdits`**: renderer.js:9748 + 5794/19743/20220 — snapshot/loadSubtitle yolunda kasıtlı çağrı.
- **`jobResourceScheduler`**: madde-28 uzun-iş network bütçesi (main.js:10561) — `job.resourceAdmission==='queued'` ise `retry-wait` durumuna geçer.

## Test kanıtı

- `npm test` (temiz master üzerinde düşüyordu) → bu dalda: **Tüm testler geçti** (213+ dosya, 0 düşüş, backend 60 dosya dahil).
- Tek tek: capture-export-deadzone 6 senaryo, core-security-r4 8 test, css-hardcoded-colors 430/430, disk-full 3/3, dom-innerhtml-ratchet 2 PASS, live-asr-fallback 6 kontrol, pure-modules-deadzone 4 senaryo, soak-deadzone 11 senaryo, atomic-write-kill 201 kontrol, ci-determinism-ratchet PASS, security-media-learning 18 test, browser-safety-controls 5, browser-subtitle-actions/-selection PASS.

## Windows etkisi

Yok — test altyapısı ve CSS token adları (Windows'ta da aynı render). `install.bat`/`start.bat` akışına dokunulmadı.

## Çalıştırılmayanlar

Electron smoke seti bu turda koşulmadı (ürün davranışı değişmedi; yalnız test/renk-token güncellemesi).
