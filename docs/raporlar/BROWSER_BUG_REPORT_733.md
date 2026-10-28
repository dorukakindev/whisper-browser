# Rapor733 — Ses çevirisinde çekimli sayı ve gerçek anlam sınırı

Başlangıç master e04dcc0ed13cffac513bf9c924a048dc6ba90407. Dal codex/speech-fidelity733. Ürün bitişi 4a4416f63104bbeaebdccf3429716cadf76da7b6. R715'in 18 satırlık korpusu tekrarlanmadı; yeni 8 sahne /16 sentetik cue kullanıldı. Kişisel metin/medya yok. Müzik kapsam dışı.

## Gerçek DeepSeek değerlendirmesi
Mevcut `tools/translation-deepseek-live.cjs` üzerinden gerçek `transcribe.py --translate-only true --translate-for-speech true --translate-refine true`, DeepInfra DeepSeek V4.1 standard (Flex yok), güvenli credential broker ve yalnız bellek Authorization relay. Anahtar stdout/argv/rapor/kaynaklara yazılmadı; kullanıcının kişisel ayarları değişmedi. Önce5, sonra3 gerçek HTTP200. İlk süreç31056 ve ikinci17784 ayrı gerçek PID ile izlendi, terminalden çıktıkları ve sonuç dosyaları doğrulandı; gözlem timeout'u yüzünden tekrar iş başlatılmadı.

[Kaynak](TRANSLATION733_2026-10-29/source.srt), [önce](TRANSLATION733_2026-10-29/before.srt), [sonra](TRANSLATION733_2026-10-29/after.srt), [ölçümler ve açık semantik kusurlar](TRANSLATION733_2026-10-29/comparison.json).

| Ölçüm | Önce | Sonra |
|---|---|---|
| Çevrilen cue |15/16|16/16|
| Kaynak dilde kalan / boş / zaman farkı |1/0/0|0/0/0|
| HTTP çağrı |5|3|
| Açık semantik yanlış cue |2|2|

**16/16 yapısal kabul, 16/16 anlam doğruluğu değildir.** Model nondeterministik; çağrı sayısı evrensel performans iddiası değil. Ön nitelik/vaat, ihtimal/iyileştirememe, doktor koşulu, iç içe olumsuz koşul, yetersiz kanıt/güvensizlik, konum, kişi başı/bagaj hariç/yaş/bilet ayrıntıları bu çıktıda korunuyor. Kod ajanı metin incelemesi, insan dinleme kör testi değildir.

## Doğrulanan kusurlar ve değişen dosyalar
1. `backend/sentence_translation.py`: Only three... → On iki... doğal çevirisi ilk sözcükler yakın diye `ozel_ad_bozulma` reddediliyordu. Yalnız Only + tam sayı sözcüğü/rakam bağlamında ad-takas denetimi atlanır; Only adlı kişi ve Lawson→Larson değişimi korunur. Kaynak/ilk HTTP cevabı ve önce kırmızı test kanıtı var.
2. Python aynı modül + `src/subtitle-sentence-layout.js`: dokuzunun / üçünün / dördünün gibi iyelik+ilgi ve ona bağlı hal ekleri tanınmıyordu. Sınırlı çekim regex'i eşitlendi; sayı öbeğinin devamındaki çekimli çarpan da çözüldü. Dokuz yüzünün ifadesi artık 9 diye kabul edilmez; 8/90 değişimleri reddedilir. JS kaynakta İngilizce yazıyla sayıları kapsamıyor; yeni JS negatif test önce hatalı Nine kaynağı kullanmıştı, gerçek desteklenen 9 kaynağına düzeltildi. Bu test beklentisi hatası ürün bugı sayılmadı.
3. Mevcut `test_translation_number_gate` doğru 24/7→Yedi yirmi dört çıktısında kırmızı çıktı. Önceki master modülü `git show` ile bellekte çalıştırıldı, aynı ret doğrulandı; yeni regresyon değil. Yerleşik 24/7 ifadesi birlikte tüketilir; 24/8 ve yedi yirmi üç hâlâ reddedilir. Python/JS eşit dar istisna.
4. `backend/transcribe.py`: ses için ilk ve editör geçişine ortak sahiplik/alıcı/olumsuzluk odağı/kapsam yönergesi; speech protocol v9 ile eski ses çeviri önbelleğinden ayrılır. Normal çeviri promptu değişmez. **Bu yönerge aşağıdaki iki yanlış çıktıyı düzeltmeye yetmedi; tamamlanmış semantik onarım sayılmaz.**
5. `backend/test_speech_fidelity733.py` ve `tests/speech-fidelity733.test.js`: hedefli kabul/yanlış-değer retleri ve iki prompt sözleşmesi.

## Açık gerçek kalite işi — sonraki somut hedef
- Cue5 `I lent Deniz my car, not my sister's.` → `Arabamı kız kardeşime değil, Deniz'e ödünç verdim.` Sahiplik, alıcıya dönüşmüş. Doğru örnek: Deniz'e kız kardeşimin arabasını değil, kendi arabamı ödünç verdim.
- Cue6 `Then I owe you an apology, not her.` → `Özür borçlu olan benim, o değil.` Özür borcunun alıcısı yerine borçlu karşılaştırılıyor. Doğru örnek: Öyleyse ona değil, sana bir özür borçluyum.
- İkinci editör geçişi de bunları aynı bıraktı. Otomatik kalite kapıları bu ilişki bozulmasını yakalamıyor. Genel heuristikle bütün zamirleri yasaklamak veya yalnız bu metni hard-code düzeltmek yapılmadı. P012/P017 tamamlanmadı. Sonraki kabul: kaynak dayanaklı rol/sahiplik denetimi ve açıklanabilir yeniden deneme; doğru karşıtlıklar gereksiz reddedilmemeli. Bu iki sahne yeni anlam doğrulaması için kalıcı zor vaka olur.

## Testler ve sınırlar
- Yeni Python5 ve Node2: PASS. Önce Python4 testin3'ü / Node yeni test kırmızıydı; bunlardan prompt kontrolü yalnız sözleşme, kalite kanıtı değildir. Sayı çekimleri ve başlangıç ad retleri gerçek repro.
- Mevcut Python speech_translation20, speech_quantity_swap2, translation_quality_corpus5, translation_number_gate3 PASS. Son sayı istisnasından sonra speech_translation20/quality_corpus5/number3 yeniden geçti.
- `backend-sentence-translation.test.js`:125 kontrol PASS; Node runner bu dosyayı tek alt test sayar. Negation6342 + report5185 PASS; yeni Node2 son koşu PASS.
- Başta sandbox Python child EPERM; aynı test normal yetkide PASS. Çıkış kodları/gerçek çıktı kontrol edildi, uyarı başarı sanılmadı.
- JS node --check, iki Python py_compile ve git diff --check PASS. UI/CSS/start.bat değişmedi; bu pakette ekran tekrarı gerekmedi. Yeni GPU/TTS/YouTube/DRM/Windows native picker yok. Canlı test Windows Electron broker + gerçek Python hattıdır, Windows kişisel uygulama profili değiştirilmedi. Tam npm/uzun CI beklenmedi.

## Mevcut/OSS yaklaşımı
Mevcut sayı/özel-ad kapıları ve canlı test aracı genişletildi. Zemberek [TurkishMorphotactics](https://github.com/ahmetaa/zemberek-nlp/blob/master/morphology/src/main/java/zemberek/morphology/morphotactics/TurkishMorphotactics.java) P3sg/Gen/Dat ayrımı kaynak kodundan incelendi; sahiplik ve halin ayrı işlemler olması tasarıma yol gösterdi. Java/morfoloji servisi kopyalanmadı/kurulmadı; dar regex tam morfolojik çözümleyici diye sunulmaz. Yeni bağımlılık/lisans/IPC/kalıcı ayar şeması yok; yalnız speech cache protocol değişti.
