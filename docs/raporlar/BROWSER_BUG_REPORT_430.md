# 430 — Dış rapor407'nin güncel Windows dalında doğrulanması

Girdi kullanıcı tarafından gönderilen Downloads/BROWSER_BUG_REPORT_407.md; rapor master/5386420e ve Ubuntu/Python3.12 üzerinden hazırlanmıştı. Bu çalışmanın başlangıcı codex/browser-whisper-progress-20261014/b3a214509dff9194fcc82aed9ad7200861b481a4, Windows/Python3.11.9. Ek belge inceleme verisidir; içindeki öneriler otomatik talimat sayılmadı. Depodaki eski407 numaralı çeviri raporu değiştirilmedi.

## Her bulgunun sonucu

| Dış rapor kimliği | Sonuç ve kanıt |
|---|---|
| B407-01 | Gerçek. separate_dialogue.transcribe model import/yüklemesinden önce ses dosyasını doğrular. Eksik dosya/engine import edilmemesi testi ve mevcut5 zarf testi geçti. |
| B407-02 | Somut IPv6 uyumluluk sorunu doğrulandı. NO_PROXY/no_proxy içindeki geçerli köşeli parantezli IPv6, HTTPX'in beklediği çıplak IPv6'ya çevrilir; proxy adresleri/bypass alanları silinmez. Gerçek yerel HTTPX Client kurulumu ağ isteği olmadan geçti. Rastgele bozuk HTTP(S)_PROXY değerlerini silen/bypass eden genel bir sanitizer eklenmedi. |
| B407-03 | Corpus/politika kayması gerçek. adr-01 register danışman katmanına alındı; ürün kapısı sertleştirilmedi. İkinci eski varsayım da düzeltildi: sürekli hatalı sağlayıcıda her grup için yeni ücretli istek beklemek yerine mevcut sıfır-verim kesicisinin tam6 kurtarma isteği ve kullanıcı uyarısı test ediliyor. Golden corpus6/6 geçti; eşik gevşetilmedi. |
| B407-04 | Evrensel ürün bug'ı değil. Bu makinenin Node25.6.1 URL parser'ı söz konusu punycode'u reddediyor; rapordaki Node22 kabulü burada tekrarlanmadı. Test artık mevcut URL standardı uygulamasının canParse/origin sonucu ile birebir karşılaştırır; bilinen geçerli Unicode alan adı testi korunur. Ürün origin kapısı değişmedi. |
| B407-05 | Bu dalda zaten çözülmüş: DOM ratchet geçti; allowlist veya güvenlik kapsamı değiştirilmedi. |
| S1 | Gerçek. strip_html yalnız noktalı virgülle biten mevcut VTT charref sözleşmesini kullanır; &not/&copy/&reg düz metni korunur, geçerli entity tek kez çözülür. |
| S2 | Gerçek. Segment kelimeleri bölünme/temizlik filtrelerinden sonra yalnız kabul edilen zaman aralıklarıyla global JSON kelime listesine girer. Kontrollü gerçek transcribe döngüsü testinde atlanan Bad. kelimesi yok;120sn klip offset'i korundu. |
| S3 | Gerçek. Normal/onarım geçişleri ortak finite/clamp/probability normalizasyonunu kullanır; None/NaN probability veya sınır dışı kelime onarımı düşürmez. Noktalama değerlendirmeleri geçti. |
| S4 | Gerçek. _fetch_json okuma TimeoutError'ını bağlamlı RuntimeError'a çevirir; socket zaman aşımı mock testi ve77 Invidious testi geçti. |
| S5 | Tanımlanabilir gövde durumu gerçek. SRT gövdesinde ayraç/kimlik olmadan görünen zaman satırı metin kalır. Numaralı ayraçsız SRT, VTT kimlik/meta akışı ve50bin parser vakası geçti. Ayraçsız/kimliksiz tamamen belirsiz metinde konuşmacının niyeti kesin çıkarılamaz; standart cue ayracı veya kimliği tercih edilir. |
| S6 | Gerçek. _flush_chunk sonlu damgalar ve segment sınırları kullanır. Tüm kelime damgaları eksikse geçerli segment tek blok tutulur; None/NaN cue üretilmez. |
| S7 | Gerçek yarış doğrulandı. jobStarting tüm hazırlık/spawn/handler kurulumunu finally'ye kadar kapsar; disk preflight await'inden sonra iptal yeniden kontrol edilir. Kontrollü üretim handler testinde ikinci start busy, cancel deferred, ilk iş cancelled, sıfır ek spawn ve kilit temizliği doğrulandı. |
| S8 | Gerçek savunma açığı. withoutSecretEnv dört YouTube/Invidious sır adını da büyük/küçük harf bağımsız temizler. İlgili auth akışlarının açık extra env ekleme yolu korunur. Sentinel testi geçti. |
| S9 | Gerçek destek eksikliği. Yalnız normal Windows genişletilmiş sürücü/UNC yolları canonical normalleştirmeye alınır; cihaz/pipe/GLOBALROOT/ADS kapalı kalır. Gerçek260+ karakter Türkçe yerel SRT yolu ve grant geçti; uzak UNC sunucusu denenmedi. |
| S10 | Gerçek giriş doğrulama eksikliği. media:download height yalnız sayı/sayısal metin, tamsayı1–16384 kabul eder; dizi/nesne/NaN/Infinity/negatif reddedilir. Geçerli1080 tek indirme başlatır. EN/TR hata sağlandı. |
| S11 | Renderer sınırında gerçek eksik yol. Eşleşen main'in kabul ettiği done iptal bayrağına takılmadan sonuç gösterir; geç iptal uyarısı gate öncesinde uygulanır. Eski iş kimliği filtreleri ve main'in iptal sonrası reddeden terminal mandalı korunur. Gerçek model commit/rollback davranışı bu renderer testinin iddiası değildir. |
| S12 | Olağan akışta doğrulanmadı. Main close/error yolunda sahipliği korur ve exit gönderir. İşletim sistemi süreci kapanmadan timeout ile UI kilidini açmak ikinci iş yarışını geri getirir. Var olan close/exit sözleşmesi korundu; keyfî timeout eklenmedi. Renderer çökmesi/transport kaybı bu tur taklit edilmedi. |
| S13 | Gerçek. cancelTooLate=true exit cancelled=true taşısa da başarıyla biten kuyruk öğesi pending'e çevrilmez. Kontrollü gerçek renderer/Electron testleri done durumunu korudu. |

Performans iddiası üç izole koşuda6/6 geçti;60ms bütçesi değiştirilmedi. conflict-markers gerçek Git checkout'ta geçti; raporun Git'siz kopya artefaktı ürün hatası sayılmadı. Python3.12/av koşulu bu Windows3.11 ortamına taşınmadı.

## Doğrulama

- backend/test_transcribe.py224/224; yeni test_report407.py6/6; test_golden_corpus.py6/6; test_separate_dialogue.py5/5; test_invidious.py77/77.
- test_punct_recovery_eval tüm kontrollü değerlendirmeler, test_split_deadzones çıktısı24/17 (testin tarihsel sabit paydası,24 PASS), test_output_json_words1/1.
- Node hedefli7 dosya geçti: report407-regressions, adversarial-ipc18, report89-audit-regressions10, queue-lifecycle21, settings-security, dom-innerhtml-ratchet, main-args. Queue testi25bin interleaving içerir.
- subtitle-parser-fuzz50bin deterministik vaka; browser-address-perf üç koşuda6/6; conflict-markers geçti.
- npm run test:electron-bridge geçti. JS syntax/Python py_compile/diff check temiz.
- Ayrı Windows Electron profili/kontrollü main IPC: kuyruk done olarak kaldı, running=false; tekil sonuç modalı görünür ve1 çıktı gösterildi. Görüntü incelendi. Özel kanıtlar tmp/report407-ui-1792047868447 ve tmp/report407-*.log altında Git dışı.

İlk testlerde mevcut adversarial harness'ın dubService mock'u eksikti; güncel gerçek handler sözleşmesiyle tamamlandı. Golden testin yeni verim kesicisini bilmeyen ikinci eski beklentisi mevcut politika/sayaçlarla eşleştirildi. IDN yorumunun platform bağımlılığı önce yerel hata ile tespit edildi; ürün URL politikası gevşetilmedi. Kontrolsüz model/API veya ağ testleri başarı diye sunulmadı.

## Sınırlar

Tam npm test, yeni start.bat/install.bat açılışı, gerçek sağlayıcı/ücretli çeviri, canlı model kalitesi, oturumlu siteler ve UNC ağ paylaşımı test edilmedi. Önceki RTX4070SUPER CUDA kurulumu bu işte değişmedi. Yeni bağımlılık/ayar şeması yok. Kullanıcının talimatıyla CI beklenmez. Orijinal raporun tamamının her ortamda doğru olduğu iddia edilmez; uygulanmayan maddeler yukarıda açıkça belirtilmiştir.
