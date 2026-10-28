# Tekrar kabulü

- `node --test --test-isolation=none tests/dub-service.test.js tests/dub-generator-ui.test.js tests/ui-locale.test.js`
- Backend Python: `tests/test_dub_regeneration643.py` (2test).
- Ayrı profile native Windows Electron: `tests/electron-dub-runtime.smoke.js`. Bu gerçek UI/IPC fakat kontrollü motor olaylarıdır. Native terminal JSON PASS; görüntüler EN1000px100%/TR800px125%.
- Gerçek GPU: R685 ile aynı sentetik SRT/referans/15step/CFG1.65/akici360chars25s/narration/fast verification iki-grup önbelleği ayrı geçici OUTPUT_ROOT'a kopyalandı; üretim `altyazi_oku.main` `--force-groups 1` ile çağrıldı. Orijinal önbelleğe dokunulmadı. Motor1generated/1cached; seçili grubun WAV SHA256 değişti, seçilmeyen grubun aynı. Ham ses ve engine yolu Git'te yok. GPU süreç sonlandı, terminal Tamamlandi işareti ve sonuç/kalite/performance dosyaları doğrulandı; süreç exit-code launch helper tarafından yakalanmadı, exit0 iddiası yok.

GPU sonucu doğal dinleme/ASR/anlam kalite onayı değildir. Fast doğrulama not_checked olarak kalır. Cache grupları tekrar sentezlendiğinde rastgele seed nedeniyle aynı hash beklenmez. Node ana süreç testi2video grubu ve4000grupluk dosya taşımasını,5001reddini,forceAll yalnız narration kuralını denetler; büyük gerçek GPU üretimi yapılmadı.
