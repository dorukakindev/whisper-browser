# BROWSER_BUG_REPORT_97 — PR #16 kabul testi yeniden doğrulaması

Tarih: 2026-09-22. PR #16; taban `b203a2d54bcb054a18498f3770eebb16214f2d92`, incelenen baş `f9112f14361b82e5c68ed46d7ba6a059c43d6e57`.

## Doğrulanmış test-kapsamı açığı

`tests/electron-browser-subtitle-gauntlet.smoke.js` önceki halinde CEA planını `.catch(() => null)` ile isteğe bağlı tutuyor, `captureFullBrowserSubtitle` başarısızlığını ve `partial`/`error`/timeout sonucunu yalnız rapora yazıyordu. Seek, EN/TR ve yenileme de sadece rapor alanıydı. Son satır `report.ok = true` olduğu için bu yollar başarısızken exit 0 dönebilirdi. Bu **ürün hatası değil, yanlış-pozitif kabul testi** idi.

## Uygulanan düzeltme

- Saf kabul kapıları `tests/browser-subtitle-gauntlet-acceptance.js` içinde: CEA planı/complete ve süre kapsamı, görünür kaynak/çift katman, ileri/geri seek, EN/TR etiketleri, yenileme sonrası kaynak izi.
- `tests/browser-subtitle-gauntlet-acceptance.test.js` pozitif ve negatif mutasyonları içerir: CEA yok/kısmi/hata/düşük süre kapsamı, görünmeyen veya karışan katman, yanlış seek parçası, yanlış dil etiketi ve boş yeniden-yükleme izi kabul edilmez.
- Gerçek Electron smoke aynı kapıları çalıştırır; otomatik yüklenen kalıcı çeviri birincil kanala geçtiğinden kaynak+çeviri izleri açıkça eşleştirilir. Görünür DOM katmanları kontrol edilir; yalnız `textContent` ölçülmez.
- Windows'ta `2>/dev/null` içeren shell komutunun sertifika üretimini engellemesi `spawnSync` argv çağrısıyla düzeltildi. Gizli pencere `document.hidden` nedeniyle overlay çizmediği için test penceresi `show/focus` ile görünür açılır; requestAnimationFrame'e sonsuz bekleme kaldırıldı. Renderer ve toplam koşu için zaman sınırı eklendi.
- Test ayarındaki GİRDİ/ÇIKTI dizinleri izole profile yönlendirildi. Önceki denemelerin gerçek İndirilenler'e yazdığı iki sentetik `Gauntlet fixture` SRT silinmeden `.uiprev/moved-legacy-test-outputs/` içine taşındı.

## Kanıt

- `node tests/browser-subtitle-gauntlet-acceptance.test.js` — exit 0; negatif kapılar sınandı.
- `node tests/browser-subtitle-gauntlet.test.js` — exit 0.
- İzole Windows Electron: `OPENSSL_BIN=C:\Program Files\Git\usr\bin\openssl.exe` ile `electron tests/electron-browser-subtitle-gauntlet.smoke.js` — exit 0; CEA `complete`, 3 çeviri cue / 1 sahte sağlayıcı isteği, görünür kaynak ve çift katman, seek 5 sn→p1 ve 0,5 sn→p0, iki dil etiketi, yenileme sonrası 8 iz. Kanıt `.uiprev/subtitle-gauntlet-contained/report.json` (Git'e alınmadı).
- Son koşuda kaynak ve çeviri çıktı yolları yalnız `.uiprev/subtitle-gauntlet-contained/profile-*/GİRDİ|ÇIKTI` altındaydı.
- `node --check` değişen 3 JS dosyasında temiz; `git diff --check` temiz.

## Ayrı doğrulama sınırları

- `npm test` bu izole Windows worktree'de 12 dosyada başarısız: kök `node_modules` içinde `jsdom` yok, bu worktree altında Python venv yok; ilgili hedefli testler ve gerçek Electron smoke geçti. Başka tam paket hataları burada tek tek sınıflandırılmadı.
- `npm run test:electron-bridge` yerel Electron'da `mojo platform_channel` erişim engeli verdi; köprü smoke'u bu ortamda geçmedi.
- 34 dakikalık soak yeniden koşturulmadı; PR #16'nın önceki raporundaki tarihsel kanıttır.
- Gerçek servis/hesap/LLM kalitesi bu sentetik fixture ile doğrulanmadı.

## Karar

Bu test-kapsamı açığı kapatıldı. PR #16 dalına fast-forward teslim ve CI sonuçları doğrulanmadan merge kararı verilmemeli.
