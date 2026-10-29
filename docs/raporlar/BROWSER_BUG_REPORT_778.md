# Rapor778 — İptal edilen sezon seçimi hazır önbelleğe dönemez

## Gerçek servis yolu reprosu

scanSeason klasör seçicisini await ettikten sonra intro önbellek yolunda abort kontrolü yapmıyordu. Seçici beklerken cancel veya sender destroyed olsa bile seçici geç dönünce ok:true/cached:true veriyordu. Parent27e74f32 üzerinde iki kontrollü repro FAIL(true!==false). Aynı kökün iki iptal tetikleyicisidir; iki bağımsız bug sayılmadı.

`src/media-workflows.js`: checkCurrent AbortSignal ve sender.isDestroyed durumunu seçiciden hemen sonra, intro awaitleri sonrası, cache/preview yayınlanmadan önce ve hizalama yanıtı sonrası denetler. Başarı yayını öncesi iptal terminali korunur; geçerli önceden var olan cache silinmez. Mevcut AbortController/owned finally cleanup yaklaşımı genişletilir; yeni bağımlılık/ayar/IPC/schema yok, dış kod alınmadı.

`tests/season-cancel778.test.js`: gerçek registerMediaWorkflows, gerçek geçici dosya stat/fingerprint ve metadata-only iki sahteMP4 dosyasıyla hazır introcache; kontrollü bekleyen dialog→cancel/destroyed→seçici cevabı. Sonuç ok:false/cacheyok, destroyed hook temiz, eski cache mevcut; cancel sonrası aynı sender yeni tarama yapıp cache'i normal kullanabiliyor. Sahte dosyalar decode edilmedi, gerçek medyatara/GPU testi değildir.

## Kabul ve sınırlar

`node --test tests/season-cancel778.test.js tests/media-workflows.test.js`:4PASS. Parent iki yeniFAIL→finalPASS. İkiJSsyntax/diffcheckPASS. RuntimeUI/tema değişmedi, yeni görsel kabul yok; gerçek Windows filepicker/senderdestroy/decoder/subprocessiptal/start.bat/tam npm bu pakette yok. Dosya sistemi ve servis handler gerçek, dialog kontrollü. Ağ/ücretliAPI yok;CIbeklenmez. P008/P047/P076/P078 kısmi ilerleme;90aktifhedef sürer.
