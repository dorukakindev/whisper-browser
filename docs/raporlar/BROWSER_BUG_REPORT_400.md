# BROWSER_BUG_REPORT_400 — Çeviri kalite kapıları yanlış-pozitif turu: canlı korpus ölçümü + 4 kök düzeltme

Tarih: 2026-10-02 (UTC). Repo: `dorukakindev/whisper-browser`. Taban: `master` `694fa38`+.

## Bağlam

Kullanıcı raporu: "Kalite kapıları bozuyor gibi çoğunlukla sürekli reddediyorlar bir şeyleri." 20 dakikalık videoda çeviri %85 blok kaybı üretiyordu (trun2: 102/120 blok çevrilemedi, kalan İngilizce 94). Deneme API anahtarıyla canlı-korpus ölçümü yapıldı.

## Ölçüm yöntemi

- Korpus: `/tmp/border_120.srt` — 120 cue gerçek YouTube altyazısı (Border Security Australia, rolling-window İngilizce).
- Sağlayıcı: `https://codecraftapi.com/v1` + `gemini-3.7-flash`, 4 worker.
- Koşu-1 (eski kapılar): 102/120 blok başarısız, ~60 istek, ret sınıfı baskın `erken_cumle_sonu` (12+), `ozel_ad_kaydi` (4+).
- Probe: gate fonksiyonları monkeypatch'lenip her ret için kaynak/hedef parça çiftleri `/tmp/trun3/rejects.ndjson`'a döküldü — 38 kayıt.
- Koşu-2 (yeni kapılar): 86/120 blok başarısız, 27 istek, çevrilen blok 18→34, kalan İngilizce 94→81.
- Yeniden sınıflandırma: probe'daki 22 arg'lı ret yeni kapı koduna beslendi → 7'si artık kabul, 15'i hâlâ ret.

## Bulgular (yanlış-pozitif sınıfları)

1. **`erken_cumle_sonu` (dominant sınıf):** kapı, hedef parçadaki TÜM cümle sonlarını sayıyordu. Model rolling-window kaynak parçayı doğal cümleyle kapattığında (`"...üzgünüm."` + `"Memurlar..."`) sondaki tek nokta ret üretiyor ve doğru çeviri İngilizce kalıyordu.
2. **`acik_baglanti`:** `_DANGLING_TAIL` içindeki `'bir'` isim-öbeği kesimini (`"ağır bir | bavul"`) sarkık sayıyordu — kaynağın birebir aynası olan doğru dağıtım ret oluyordu.
3. **`tekrarli_part`:** rolling-window kaynakta içerik paylaşan parçalara (`"um yeah um"` ⊃ `"um"`) aynı hedefin dönmesi (`"şey"`/`"şey"`) tembellik sanılıyordu.
4. **`ozel_ad_kaydi`:** orta-cümle büyük harfli ORTAK isimler (`"a young Backpacker"`) hedefte küçük harfle doğru çevrilirken (`"genç backpacker"`) `_name_preserved` yalnız büyük harfli token'ları taradığı için kayıp sayılıyordu.

## Kalan retler — gerçek kusur (kapı doğru)

Yeni kapıyla hâlâ reddedilen 15 kayıt elle incelendi; hepsi gerçek kusur:

- Parça-İÇİ cümle sınırı: `"...sorguluyor.\nPasaportu yurt dışındayken"` — cümle ortasından kapanıp devam cümlesi aynı cue içinde başlıyor (Jung-sınıfı anlam kayması).
- Rolling-window yankı: `"ve genç backpacker dili tutuldu ve genç backpacker dili tutuldu"` — model kaynak tekrarına aynen sadık kalıp kekeme metin üretmiş.
- Diyalog kayması: soru+cevabın aynı cue parçasına sıkışması (zamanlama hizası bozulur).

Bu içerikteki ana residual sorun kapılar değil kaynağın patolojisi: YouTube rolling-window altyazısında her cue bir öncekinin içeriğini tekrarlar; model sadık çeviri üretince çıktı yapısal olarak kapıların yakaladığı kusur desenlerini taşır.

## Düzeltmeler (`backend/sentence_translation.py`)

1. **`sentence_part_boundary_issue`:** hedefte İÇ cümle sonu (sonrası metinle devam eden) her zaman ret. Sonda terminal nokta ise ayrım yapılır: sonraki parça büyük harfle başlıyorsa doğal kapanış → kabul; küçük harfle başlıyorsa yetim devam imzası → ret (`_starts_lowercase_continuation`). Jung-sınıfı gerçek kusur (`"...emer."` + `"daha parlaktır"`) korunur.
2. **`_DANGLING_TAIL`:** `'bir'` çıkarıldı; gerçek sarkmalar `_PAIR_MATES` (`değil|mi` vb.) ile yakalanmaya devam eder.
3. **`part_repetition_issue`:** kapsayan/kapsanan kaynak çiftine aynı hedef artık sayılmaz; ilgisiz kaynaklara aynı hedef (`"Yes."/"No."`→`"Evet."/"Evet."`) hâlâ ret.
4. **`_name_preserved`:** son çare olarak büyük/küçük harf duyarsız kanon-eşitlik taraması (`_canon_name` zaten casefold'ludur). Bulanık eşleşme açılmadı — `'larson'`↔`'lawson'` yine sayılmaz.

## Testler

- `test_sentence_distribution.py` güncellendi: sonda-nokta sözleşmesi (büyük/küçük devam ayrımı), 'bir' tail, içerik-kapsamalı tekrar, caseless ad koruma — 43/43.
- `golden-corpus-tr.json` sb-01..04 kusur parçaları küçük-harf devamlı hâle getirildi (gerçek erken-kapama imzasını temsil eder) — 6/6.
- `test_transcribe.py` 222/222 (Jung premature-boundary testi düzenlenmeden geçti — küçük-harf imzası doğru sınıfı yakaladı), quality corpus, meaning-loss, name-consistency, pack-fuzz — hepsi yeşil.

## Sınırlar

- `blocking` sınıfı (anlam kapıları: modal/negation/register) probe'da args'sız kaydedildi; trun4'te `anlam_modal_missing`, `anlam_modal_certainty_flip`, `date_kaydi` görüldü — çiftleri olmadan FP/TP ayrımı yapılamadı. Gerekirse aynı probe tekniğiyle ölçülür.
- Bu korpusta bile çevrilemez kalan 86 blok büyük ölçüde rolling-window kaynak patolojisinden; kapı gevşetmesiyle değil kaynak dedup'uyla ilgili ayrı bir iş kalemi olabilir.
- `date_kaydi` (1 ret) incelenmedi — düşük frekans.

## Etki

- İstek sayısı ~60→27 (aynı korpusta); çevrilen blok 18→34. Endpoint gecikmesi sabit kaldığı için kullanıcının gördüğü bekleme de orantısal kısaldı.
- Yanlış-pozitif maliyeti sıfır değilse bile ölçülü biçimde azaldı: ölçülen 7/22 kabul tamamen doğru çevirilerdi.
