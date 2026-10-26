# Rapor599 — Claude INTERIM-1 paketleri ve kalan anlam/sayı açıkları

## Paket kimliği

Kullanıcının files (2).zip ve files (3).zip dosyaları ayrı ZIP container hash'lerine sahip, fakat içlerinde aynı adlarla byte-birebir eşit iki dosya var: AUDIT-REPORT-INTERIM-1.md ve suggested-fixes-INTERIM-1.patch. Her ZIP20.927bayt,2girdi; CRC kontrolü geçti. İki farklı denetim veya ek bulgu paketi değildir.

İçerik hash'leri: rapor8444303710f952e83e231af6cc60687fd566450e9e5c4cc5aa8c46d642656bfe; patchc4f443ee0ed877d50d4611632c05b847c03130a1af5b18a0170843eac3a55484. Bunlar bizim ürün kaynak hash'imiz değildir.

Rapor kendisini ara sürüm1, tamamlanmamış olarak tanımlar. Snapshotab2fad0a731cd302385779a7666bdeef80d722cd; inceleme başlangıcındaki güncel master6250c26d69d3fab321e34425e7d76cfd69d550d5. PR496/497 sonrasında bazı bulgular zaten farklı uygulamalarla düzeldi. Rapor593/596/597/598 ile birlikte karşılaştırıldı.

## Kabul kararı

| Dış bulgu | Güncel durum ve bu tur kanıtı |
| --- | --- |
| F01 manga anahtarı | PR496 explicit-inherit sınırı geçerli; gerçek config/request fetch sınırı regresyonu geçti. Dış patch aynı scope/rota için örtük devralmaya da izin veriyor; mevcut daha açık politikamıza dönülmedi. |
| F02 olumsuzluk | Dokuz örneğin sekizi mevcut kodda reddedildi. Gelmeden gitti→Gelip gitti kabul edildi; uzun metinde similarity0.95 ve review=false ile Python kapısını da geçti. Kalan boşluk gerçek; aşağıda bağımsız düzeltildi. |
| F04 ters süreli cue | Mevcut parse_srt artık cue1/end1000ms/start2000ms ile açık hata veriyor. Dış taslak uyarı üretip konuşmayı yine atlıyor. Böyle bir politika uygulanmadı; süre uydurma ve sessiz metin kaybı yerine mevcut ret korundu. |
| F06 binlik sayı | Toplam1.500kişi güncel kodda doğru genişliyor ve speech_check review=false. Dış testlerin sıfırla başlayan örnekleri genişletilince güncel kodda başka kalan boşluk bulundu; aşağıda düzeltildi. |
| F07 kompakt SRT | PR496 bounded find sonrası güncel 5k0.0452sn,10k0.0891sn,20k0.1828sn. Her ikiye katlamada yaklaşık2kat; eski O(N²) uygulamaya dönülmedi. Dış eski baseline5.04sn ölçümü burada yeniden koşulmadı. |

Patch git apply --check ile salt okunur kontrol edildi; main.js/browser-manga/dub_finish gibi güncel bağlamlarda uygulanmıyor (exit1). Hiçbir dış patch uygulanmadı ve arşivden kod/probe çalıştırılmadı. İnceleme dosyaları ignored tmp/audit599 altında tutulur; kullanıcı ZIP'leri değiştirilmedi.

## Bağımsız düzeltmeler

Başlangıç6250c26d69d3fab321e34425e7d76cfd69d550d5; dal codex/audit-followup599; ürün/test bitişb0dae9f8aa9b55d075a2a84de40e2b13d4624109.

1. **Olumsuz zarf-fiiller.** Sınırlı kök listesindeki fiillerin -meden/-madan, -meksizin/-maksızın ve -meyince/-mayınca ekleri JS düzenleme korumasına ve Python ses doğrulamasına eklendi. Gelmeden/Gelmeksizin/Gelmeyince→olumlu eşleri iki yönde reddedilir; aynı metin kabul edilir. Uzun cümlenin genel similarity değeri yüksek olsa bile semantic_mismatch review üretir. Bu tam dilbilimsel anlam eşdeğerliği garantisi değildir; isim/fiil belirsizliğinde koruma tutucu olabilir.
2. **Sıfırla başlayan miktarlar.** grouped_quantity açık birim bağlamında 0.500kg→0500kilogram ve01.500kişi→01500kişi üretiyordu. Noktanın silinmesi doğrudan doğrulandı; gerçek TTS'nin500dediği iddia edilmedi. Başında0olan noktalı gösterim artık binlik sayı kabul edilmiyor:0.500kg→0.500kilogram, -0.500kg→-0.500kilogram,01.500kişi korunur. Birim genişletme bağımsız mevcut davranıştır. Ses metni sürümü v6 oldu; yeni üretim cache kimliği ayrılır, eski dosyalar silinmez.

Değişen dosyalar: src/dub-text-guard.js ve tools/voxcpm2/dub_quality.py (aynı zarf-fiil ek aileleri); tools/voxcpm2/dub_finish.py (leading-zero kapısı ve v6); tests/dub-text-guard.test.js/test_dub_quality.py/test_dub_finish.py (anlam ve sayı regresyonları). Dış patch'teki tüm fiilleri yakalamaya çalışan geniş regex ve isim istisnaları aynen kopyalanmadı.

## Raporun kanıt sınırı

INTERIM-1 ortamında ağ/node_modules/Electron/jsdom/soundfile yok; soundfile scipy tabanlı WAV/header taklidi ile denenmiş. Böyle bir ortam gerçek SoundFile blok doğrulamasını, GPU/TTS kalitesini veya native tasarımı kanıtlamaz. ZIP'te rapor ve patch dışında suite-results.csv, ham probe dosyaları, RUN-LOG, ekran görüntüleri ve MANIFEST yok. Rapordaki690dosya koşumu ve525/45Node86/34Python sayımı bu eklerden bağımsız doğrulanamadı; bunlar harici beyan olarak kalır. Sınıflandırılmış ortam/paket sınırlarının ürün bugı olmadığını kabul ediyoruz, fakat bütün kırmızıların kökünü bu iki dosyadan kesinleştirmiyoruz.

Önerilen manga testindeki bazı .every kontrolleri boş istek dizisinde de true dönebilir; anahtarın gerçekten kullanıldığı mutlu yolda istek sayısı da assert edilmelidir. Taslak testin geçmesi tek başına tam akış kanıtı değildir. Dış yeni UI uyarılarının i18n/gerçek görünüm kabulü de yapılmamış; mevcut UI'ya taşınmadı.

## Yerel doğrulama ve teslim sınırları

Windows'taki gerçek bağımlılıklarla dub-text-guard ve manga-provider-isolation597 geçti; Python quality9/finish13/plan12/generation19 geçti. Yeni meaning örneği önce gerçek fonksiyonda kabul ediliyordu; regresyondan sonra reddediliyor. leading-zero separator kaybı önce/sonra karşılaştırıldı. node --check, py_compile ve diff kontrolü geçti. Son üretim testindeki EngineStalled/wrong reference satırları kontrollü beklenen hata fixture'larıdır.

Ücretli API/kişisel anahtar/gerçek TTS GPU/canlı YouTube veya tasarım değişikliği yok. UI değiştirilmediği için native ekran testi tekrar edilmedi. Tam suite ve uzun CI sonucu beklenmedi. Bağımlılık ve start/install akışı değişmedi. Kod/belge commitleri ayrılır; normal PR ile master ve ana programa teslim edilir. Kişisel manifest, anaINDEX516 ve untracked kullanıcı dosyaları korunur.
