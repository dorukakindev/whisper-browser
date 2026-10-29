# Rapor779 — Gerçek Windows sezon senkron servisi kabulü

R777 düğme/selection ve R778 iptal sınırı sonrası mevcut gerçek servis çalıştırıldı; yeni ürün bugı veya özellik uydurulmadı. Ürün başlangıç/bitişi6fab1d7842365c8aed5c8a24be0829bb809b6c1c, yalnız belge/kanıt değişimi.

## Kaynak ve gerçek işlem

Kurulu Python ffsubsync/FFmpeg, iki35s160×90MP4 ve UTF8BOM3cueSRT. Önceden üretilmiş sentetik Türkçe Tolga konuşması1/12/23s konumlarına yerleştirildi; altyazı1ve2s kaydırıldı. Gerçek registerMediaWorkflows batch-sync→browser-alignment→Python browser_align.py→ffsubsync-audio-vad→önizleme→sync-apply. Native GUI seçici yerine kontrollü dialog klasör yolu döner; dosya sistemi/decoder/aligner gerçektir. Kişisel medya/model/API yok.

[Sonuç](SEASON779_2026-10-29/result.json):iki preview, üçer değişen cue, ölçülen kayma1.04/2.04s. Bilinen kaynak başlangıcına yaklaşık40msfark; yapay periyodik örnek doğal konuşma/gerçek dizi kalite kanıtı değildir. Confidence medium model çıktısı, insan onayı değildir. autoApplyfalse korunur. İlk teknik koşu1.349s; guard kabulü2.342s, benchmark iddiası yok.

Yalnız Bolum01 seçilince1yeni.alignedSRT/3cue/BOM yazıldı. Dört özgünMP4/SRT hash'i değişmedi. Tüketilen token ikinci kaydı reddetti. Yeni önizleme alınıp kaynakSRTsonradan değiştirilince sync-apply reddedildi ve hiçbir yeni kopya yazılmadı; sentetik kaynak baytları finally ile geri getirildi.

## Tekrarlama ve dürüst sınırlar

[Fixture üretici](SEASON779_2026-10-29/fixture.py), [servis kabul runner](SEASON779_2026-10-29/run.cjs) repo kökünden çalışır; tmp/r752/turkish-reference.wav sentetik referansı ve makinenin mevcut kuruluPython/FFmpeg yolları gerekir. Paket bağımsız/kurulumsuz değildir. Medya ignore edilen tmp altında tutuldu, Git'e WAV/MP4 alınmadı. Runner OSexit0 doğrudan gözlendi. İlk guard koşusu önceki aligned çıktısını sıfır varsaydığı için assertFAIL; ürün hatası değildi, başlangıç dosya listesini karşılaştıracak şekilde düzeltildi. Önceki çıktı silinmedi.

`node --test tests/season-cancel778.test.js tests/media-workflows.test.js`:4PASS. Önizleme/senkron gerçek; bu tur gerçek FFmpeg süreç iptali, OSfilepicker, UIclick/kişiselstart.bat/tam npm/GPU sınanmadı. Önceki native kontroller ayrı R777kanıtıdır. UIürün değişmediğinden yeni görsel test yok. CIbeklenmez;90aktifhedef sürer.
