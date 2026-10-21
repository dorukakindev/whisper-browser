# BROWSER_BUG_REPORT_499 — Altyazı kimliği, dosya okuma ve kurtarmada 20 hata

2026-10-21; dal `codex/broad-bugs499`.
Başlangıç HEAD: `76f6d19751ecfd42c19d1f91cf4d34716303c716`.
Bitiş ürün commit: `bd10e8f3a4436fe071cf81470db8754724da3fa5`.
Origin/master: `957bbfe91edee709accb24624e9e945e7a7a2969`.
Önceki teslimlerin henüz birleşmemiş commit'leri korunur. Ana checkout değiştirilmedi.

Her satır kontrollü girdide eski/yeni davranışla doğrulandı. Hepsi kritik değildir:
yanlış satır eşlemesi, konuşma metni bozulması ve dosya kaybı önceliklidir;
bozuk/gelecek sürüm dosya senaryoları daha seyrek sınır durumlarıdır.

| No | Etki ve kök neden | Düzeltme |
|---|---|---|
| 499-01 | Çeviri scheduler'ı cueId yerine id/index kullanıyordu; kaynak kimliği çıktıya taşınmıyordu. | Kanonik cueId öncelikli. |
| 499-02 | Scheduler Number(null/false/[]) ile olmayan başlangıcı sıfır sayıyor, yanlış zamanda çeviri üretiyordu. | Zaman alanları sayı veya boş olmayan sayısal dizgi olmalı. |
| 499-03 | Büyük Retry-After native timer'ın 32-bit sınırını aşıp 1 ms'ye düşüyor, erken uyanma döngüsü yaratıyordu. | Sonlu ve 32-bit sınırlı bekleme; tekrar kurulum da sınırlı. |
| 499-04 | Reconcile kaldırılan/değişen cümlenin failure kaydını silerken retry timer'ını bırakıyor; whenIdle eski bekleme bitene kadar çözülmüyordu. | Cümleye bağlı timer temizliği ve eski failure nesnesi denetimi. |
| 499-05 | JSON3 events veya segs içindeki null doğrudan dereference edilip tüm track ayrıştırmasını çökertiyordu. | Bozuk satır/segment atlanır, geçerli konuşma korunur. |
| 499-06 | Genel JSON yalnız id/start/end/text taşıyor; konuşmacı, protected ve konum bilgisi düşüyordu. Sonraki cümle birleştirmesi konuşmacı sınırını kaybedebiliyordu. | İzinli sunum/kimlik alanları korunur; ham sağlayıcı zaman alanları çıktıya sızmaz. |
| 499-07 | JSON3 aAppend her zaman son cue'ya ekleniyordu; araya başka caption penceresi girince iki konuşma karışıyordu. | wWinId başına önceki cue; pencere region bilgisi korunur. |
| 499-08 | Geçerli JSON `null` metadata cevabı data.kind erişiminde çöküyordu. | Metadata nesne değilse boş sözlük kabul edilir. |
| 499-09 | Ortak normalizer null cue veya nesne biçimli liste üzerinde map/dereference hatasıyla dosya açmayı durduruyordu. | Liste ve kayıt biçimi kontrol edilir; sağlam cue'lar korunur. |
| 499-10 | Ortak normalizer null/boolean başlangıçları video başında gerçek cue sanıyordu. | Tipli zaman kontrolü; gerçek 0 saniye korunur, olmayan bitiş hâlâ onarılır. |
| 499-11 | Output sözleşmesi ilk descriptor'ın sourceId'sini seçiyordu; eski çeviri ilk sıradaysa güncel kaynak ve çeviri eleniyordu. | Kaynak descriptor'ı soy bağı için öncelikli. |
| 499-12 | Yalnız çeviri/dual çıktıda source descriptor yoksa sourceHash kontrolü atlanıyor, farklı revizyonlar birlikte seçiliyordu. | Kaynak olmadığında ilk bilinen hash revizyon sınırı olur. |
| 499-13 | Python UTF-32LE BOM'unu UTF-16LE sanıyor, UTF-32BE'yi legacy kodlama sanıyordu; metin NUL/çöp karakterle geliyordu. | Uzun BOM imzası önce kontrol edilir, UTF-32 iki endian okunur. |
| 499-14 | BOM'suz UTF-16 SRT backend'de UTF-8/legacy sanılıp NUL'lu metin veriyordu; browser ile backend farklı sonuç çıkarıyordu. | Alternatif NUL kanalı ve altyazı başlığı/zaman oku kanıtıyla UTF-16 algılama. |
| 499-15 | Kesik BOM'lu Unicode dosyası decode hatasında legacy'ye düşüp bozuk metin olarak çeviri/sese gidebiliyordu. | Açık BOM güvenilir kodlama kanıtıdır; kesik UTF-8/16/32 reddedilir. |
| 499-16 | Gelecek sürüm video altyazı tercih dosyası eski yedekten açılınca sonraki kayıt aslı eski şemayla eziyordu. | Yedek okunabilir, put/remove yazımı engellenir. |
| 499-17 | Tercih dosyasında subtitleSelection:'bad' truthy kontrolünü geçiyor, normalize sonucu null olsa da sağlam yedek kullanılmıyordu. | Normalize edilmiş seçim nesnesi gerekli; kayıt atomik doğrulanır. |
| 499-18 | Aynı kanonik video için yinelenen tercih satırı öncekinin dosya/senkron seçimini sessizce eziyordu. | Kimlik tekilliği doğrulanır, sağlam yedeğe dönülür. |
| 499-19 | Gelecek sürüm çeviri cache'i bozuk sayılıp taşınıyor ve eski şemayla değiştiriliyordu. | Asıl ve journal korunur; yedek okunabilse de set/flush/compact yazamaz. |
| 499-20 | Cache journal'ında eksik timestamp Date.now ile tazeleniyor; aşırı gelecek tarihli değer TTL'den süresiz kaçıyordu. | Temel/journal tarihleri sonlu, pozitif ve TTL ufku içinde olmalı. |

## Kanıt ve doğrulama

- `tests/report499-regressions.test.js`: 17 Node senaryosu, baseline'da 17 başarısız; düzeltilmiş kodda 17 geçti. Kontrollü timer testi gerçek zaman bekletmez.
- `backend/test_report499.py`: 3 dosya kodlama senaryosu, baseline'da 3 başarısız; düzeltilmiş kodda 3 geçti. UTF-8-sig/cp1254 olumlu kontroller de mevcut.
- Baseline, edit öncesi kaynak kopyasıdır; bağımlılıklar baseline dosya konumundan çözülür. Kanıtlar kişisel veri içermeyen ignored `tmp/report499/` içindedir; ham log Git'e eklenmedi.
- İlgili mevcut Node dosyaları geçti: browser-subtitles, browser-subtitle-output, subtitle-output-contract, browser-subtitle-preferences, browser-translation-cache, browser-translation-early-timer, browser-translation-merged, browser-translation-source-revision, browser-translation-reliability, browser-translation-quality-loop, browser-translation-refresh, browser-translation-integrity, report497-regressions, report498-regressions, browser-translation-offline, browser-translation-job-context, browser-translation-retranslation-count, translation-cache-fuzz (114 senaryo).
- `test_transcribe.test_read_subtitle_text_encodings()` mevcut Python kontrolü geçti.
- `node --check`: değişen JS ile main/preload/renderer; `python -m py_compile`: değişen Python dosyaları; `git diff --check` geçti.
- İzole Windows Electron `tests/electron-browser-trusted-bridge.smoke.js --disable-gpu` geçti.
- İlk ilgili test koşusunda genel JSON'a ham alanların taşınması iki eski beklentiyi bozdu; düzeltme yalnız izinli metadata'yı taşır. Cache ve fuzz testlerindeki gelecek sürümü arşivleme beklentisi yeni veri koruma sözleşmesine göre değiştirildi; bozuk şema kurtarma beklentileri korundu. Bu kontroller tekrar geçti.

## Sınırlar

UI yerleşimi, start.bat/install.bat, dosya seçici ve GPU bağımlılığı değişmedi.
Yeni bağımlılık veya veri şeması yok. Kesik BOM'lu dosya artık açık decode hatası verir;
gelecek şema dosyaları eski uygulamada yazılamaz. Bu kasıtlı veri korumasıdır.
UTF-16 BOM'suz tespit konservatiftir; her dil/kodlama için otomatik doğruluk iddiası yok.
Gerçek start.bat üretim açılışı, GPU/TTS/Whisper, YouTube, DRM, kişisel hesap ve Ubuntu koşumu yapılmadı.
Tam npm test çalıştırılmadı. GitHub CI açık kalır; teslim sonucu beklemez, görülmeyen sonuç yeşil sayılmaz.
