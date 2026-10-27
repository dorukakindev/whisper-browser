# Rapor636 —1000 hedef başlangıcı, sesli kitap kalite kapsamı

Başlangıç master db2b870e1dea2c6231f07123e90a8ab6f845856e; ürün69b0fff79505339da80870a18984b58f7a2fb297. Yeni1000 planı PRODUCT_1000_2026-10-27/PLAN.md ve kanonikTASKS.json. Önceki100 veya DeepSeek read-only1000 tekrar tamamlandı sayılmaz. Yaklaşık çalışma penceresi27Ekim09:26–19:26TR; süre garantisi yok.

## İki doğrulanmış bağlı hata

1. Main dub output qualityIncomplete/qualityUnavailable taşısa bile book capture yalnız mevcut ready gruplarına bakıp tüm bölümü ready yapıyordu. Yeni book-quality-scope636 assertion ready≠review ile kırmızı oldu. Artık ses kopyası korunur, tam metin ve gerçek WAV süresiyle tek review alanı hazırlanır; qualityMissing saklanır ve export-preview inceleme öncesi reddedilir. Var olan ready subset tam bölüm kanıtı değildir.
2. Bu tam-bölüm review satırı gerçek sentez grubunun ordinali değildir; retry o key'i gönderirse yalnız bir parçayı yenileme/invalid group riski vardı. Yeni main/renderer kontrolleri retryWholeChapter olmadığı ve boş forceGroups yüzünden kırmızı oldu. Main retryWholeChapter döndürür; renderer mevcut planDub yolundan güncel bütün gerçek anahtarları alır. Normal tek-grup onarımı aynı kalır. Yeni IPC yok, mevcut response içinde ek boolean; eski kişisel ayar/proje şeması değişmedi.

## Kontroller

- book-quality-scope636, book-regenerate-request, book-voice-takes, assistant-book-actions, book-command-flow, dub-engine-worker:19/19. Bir doğal Pythonspawn testi sandboxEPERM nedeniyle ilk sefer18/19; aynı beklenti izinli alt süreç koşumunda19/19, test gevşetilmedi.
- test_dub_runtime4/4 ve test_dub_generation_quality20/20; kontrollü motor/kontrollü GPU bilgisi. Gerçek model/provider/ses kalitesi değildir. Motor ready hatasının çağıranfinally ve workerreset ile zaten korunduğu görüldü; bu konuda yeni bug uydurulmadı.
- Windows native electron-book-quality636 exit0: .uiprev/book-quality636/1793083245267-14560. Eksik quality ile bölüm review, M4B preview reddi, tam bölüm metni; ENdark1280×900 ve TRlight800×760 warning görüntüleri incelendi. İlk native senaryoda asenkron modalı beklemeden state=null okunmuştu; uygun state beklemesi eklendi. Görüntü gizli p yerine görünür warning'e scroll edilerek alındı.
- JSsyntax ve diff kontrolü geçti; tam npm test/CI beklenmedi. start.bat/kurulum/CUDA/gerçek GPU sesi bu paketle yeniden sınanmadı. Yeni bağımlılık yok. Kişisel app kapatılmadı, ignored profiller ve WAVfixture kullanıldı.

1.000 hedefin yalnız ilk 16 maddesine sınırlı kanıt eklendi;984 açık (kanonik dosya kesin sayı). Bunlar16 bug değildir. İlkpaket tesliminden sonra aktif hedef sürer.
