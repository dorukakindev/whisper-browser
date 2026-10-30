# R815 genişletmesi — kanıtları yeniden üretme

İncelenen ürün HEAD: `6b3df86e35db8bc3271440f06c779cfb0acb2c22`. Sonraki belge commit'leri ürün dosyalarını değiştirmez. Kesin dosya SHA256 değerleri [findings.json](findings.json) içindedir. Toplam 54 bulgunun 3'ü önceki turdandır; kalan 51 ekin 50'si bu tur doğrulama, 1'i eski açık mekanizmanın entegre tekrar doğrulamasıdır. Ajanlar kullanıcının isteğiyle GPT‑6.1 Sol / medium effort kullandı.

Problar **hatalı davranışı bekler ve doğrular**. Exit0, uygulamanın düzeldiği veya bütün test paketinin geçtiği anlamına gelmez. API/ASR/süreç ve IO kenarları kontrollüdür; ücretli API veya kişisel profil gerekmez. Node ve Python venv bu depoda zaten kuruluydu; yeni bağımlılık eklenmedi.

## Güvenli çalışma yeri

Yayınlanan kaynaklar inceleme içindir. Modül yolları özgün iki seviyeli geçici dizine göre yazıldığı için aşağıdaki gibi repo kökünden `tmp/deep815-*` altına kopyalayarak çalıştır. **Yayın kanıtlarının üstünde doğrudan çalıştırma.** Kopyalar yalnız kendi sentetik fixture dosyalarını oluşturur; ürün dosyasına yazmaz. Eski kişisel klasörün üzerine kopyalama; temiz test checkout'u tercih et.

```powershell
New-Item -ItemType Directory -Force tmp/deep815-browser, tmp/deep815-backend, tmp/deep815-assistant | Out-Null
Copy-Item docs/raporlar/evidence815/deep/browser/*.cjs tmp/deep815-browser/
Copy-Item docs/raporlar/evidence815/deep/backend/*.py tmp/deep815-backend/
Copy-Item docs/raporlar/evidence815/deep/assistant/probe.cjs tmp/deep815-assistant/
Copy-Item docs/raporlar/evidence815/deep/root/candidates.cjs tmp/deep815-candidates.cjs
Copy-Item docs/raporlar/evidence815/deep/root/integrations.cjs tmp/deep815-integrations.cjs

node tmp/deep815-browser/probe.cjs
node tmp/deep815-browser/features-probe.cjs
node tmp/deep815-browser/runtime-probe.cjs
node tmp/deep815-browser/ipc-probe.cjs
node tmp/deep815-assistant/probe.cjs
& backend/venv/Scripts/python.exe tmp/deep815-backend/probe.py
& backend/venv/Scripts/python.exe tmp/deep815-backend/resume-probe.py
node tmp/deep815-candidates.cjs
node tmp/deep815-integrations.cjs
```

Bu komutlar ana ajan tarafından özgün `.tmp` konumlarında tekrar çalıştırıldı: 9/9 exit0. Tam komutlar [parent-verification.json](parent-verification.json) içinde. Probların her vaka sayısı tekil bug toplamıyla aynı değildir; negatif kontroller ve bir bugın birden fazla yüzeyi vardır. Numara eşlemesi [findings.json](findings.json) `mapping` alanındadır. Asistan A09 kontrolü kanıt boşluğudur, 54 sayısına dahil değildir.

## Native Windows ve gerçek medya sınırları

[root/native-audit.cjs](root/native-audit.cjs) gerçek ürün main/renderer'ını ayrı `.uiprev` profiliyle açan native denetim kaynağıdır. Yalnız kaynak incelemek için değil çalıştırmak için kullanılacaksa `tmp/native-audit815.cjs` konumuna kopyala. `ELECTRON_RUN_AS_NODE` kaldırılmışken mevcut Electron ile çalışır. Bu kaynak ikinci ayarlar/araçlar turudur; ilk browser menüsü durumları [native-axe-browser.json](native-axe-browser.json) ve [browser-more-menu.png](browser-more-menu.png) içinde ayrıca kanıtlandı. İlk turdaki görünmeyen settings-drawer/studio isimli denemeler gerçek o yüzeyin görsel kabulü sayılmaz; ikinci tur AppSettingsUI üzerinden gerçek görünen pencereleri açtı. Native tarama 19 istenen durum içerir, 19 bağımsız ekran/bug veya bütün yüzeyler demek değildir.

WMV ses mux karşı kontrolü için kullanılan gerçek komutlar aşağıdadır. Bunlar **yeni ve yalnız bu teste ayrılmış** klasörde çalıştırılmalıdır. Medya kısa, sessiz siyah görüntü ve sentetik sinüstür. Kaynak veya font dosyaları Git'e eklenmez.

```powershell
$auditMediaRoot = Join-Path (Get-Location) ('tmp/media815-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $auditMediaRoot | Out-Null
$auditWmv = Join-Path $auditMediaRoot 'source.wmv'
$auditMp4 = Join-Path $auditMediaRoot 'copied-audio.mp4'
& C:/ffmpeg/bin/ffmpeg.exe -v error -f lavfi -i color=c=black:s=32x32:r=5 -f lavfi -i sine=frequency=440:sample_rate=44100 -t 0.4 -c:v wmv2 -c:a wmav2 $auditWmv
& C:/ffmpeg/bin/ffmpeg.exe -v error -i $auditWmv -c:v libx264 -c:a copy $auditMp4
# İkinci komut: wmav2/MP4 desteklenmeyen codec hatası beklenir (gözlenen exit -22).
```

TTC denemesinde aynı kısa MKV'ye Windows `cambria.ttc` font attachment'ı eklenip gerçek extractFonts çalıştırıldı; 0 font döndü. [native-media.json](native-media.json) sonuçları içerir. Font koleksiyonu ve MKV yalnız geçici klasörde tutuldu; dağıtılmadı. İlk TTC fixture denemesinde eski AVI'nin timestamp sorunu vardı; doğrudan lavfi MKV ile ayrıştırıldı. Bu fixture sorunu yeni ürün bugı sayılmadı.

## Risk eki ve dürüst sınırlar

[dependency-audit.json](dependency-audit.json) npm'in iki high paket kaydıdır; 15 advisory eşleşmesi 54bug sayısına katılmadı. Undici kurulum zincirindedir; fork backportları/çalışan uygulama sömürü yolları ayrıca incelenmelidir. `npm audit` bu nedenle exit1 döndü; başarısızlık gizlenmedi ve paket yükseltilmedi.

Yeni tam npm suite, start.bat/install.bat normal açılış, gerçek ASR/TTS/GPU, ücretli sağlayıcı, DRM/hesap, fiziksel dinleme, NVDA/JAWS ve CI sonucu doğrulanmadı. Kontrol edilen native ekranlar bu alanların kabulü değildir. Ürün kodu ve mevcut testler değiştirilmedi; rapordaki 54 hata açık kaldı.
