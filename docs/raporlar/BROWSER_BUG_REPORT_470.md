# Rapor470 — Kısa ve boş hedef altyazı kalite denetimi

2026-10-19. Kullanıcı yeni bugları bulup düzeltmemizi istedi.
Çalışan checkout HEAD: `e87b9238111bf2eb2f43a407cfbc607e70f70b5d`.
Kullanıcının yenilediği AGENTS talimatıyla güncel uzak master'dan ayrı
dal açıldı: `codex/subtitle-quality-audit470`.
Taban: `5386420ed80464c46719d4fd3df56013e1e2e958`.
Kod commit'i: `1f493ee51bdbeaab1b5c481e530ac71df99c5aa0`.

## 470-01 / Orta — Birebir kısa cue yanlışlıkla eksik sayılıyor

`src/subtitle-pair-quality.js::alignByOverlap` tüm eşleşmelerden en az
150 ms çakışma istiyordu. Kaynak ve hedefin başlangıç/bitişi aynı olsa
bile 100 ms'lik geçerli bir cue hem eksik hem fazladan sayılıyordu.
`auditSubtitlePair([{start:1,end:1.1,text:'Yes.'}],
[{start:1,end:1.1,text:'Evet.'}])` eski kodda pass=false.

Düzeltme: mevcut milisaniyelik timestamp kimliğiyle birebir eşleşen
pozitif süreli kısa cue'lar ayrıca indekslenip kapsama alınır. Farklı
zamanlarda yalnız 100 ms çakışan cue için eşik korunur; genel eşiği
gevşetmek veya test silmek çözüm olarak kullanılmadı.

## 470-02 / Orta — Birleştirilmiş boş hedef denetimden geçiyor

Boş metin denetimi yalnız birebir timestamp eşleşmeleri üzerinde
yapılıyordu. 0–2 ve 2–4 saniye kaynak, 0–4 saniye boş hedef ile zaman
kapsamı tam görünürken matchedCues=0 olduğundan emptyTarget=[] ve
pass=true çıkıyordu. Aynı eksik denetim kaynak dışında kalan boş
hedefleri de raporlamıyordu.

Düzeltme: emptyTarget, bütün hedef cue'lar üzerinden bir kez hesaplanır.
Tam eşleşmelerde çift rapor yok; nonempty birleştirilmiş cue kabul edilir.
Bu, birleşik hedeflerde tüm anlamsal kapıların uygulandığı iddiası değildir;
sayı/olumsuzluk gibi anlam kapılarının nonexact cue kapsamı genişletilmedi.

## Kanıtlar

`tests/report470-regressions.test.js`: dört test. Eski kodda üç kırmızı,
kontrol testi yeşil; düzeltmeden sonra dördü yeşil. Kontrol: tesadüfi kısa
çakışma reddi, geçerli birleşik hedef kabulü. Var olan eşikler korunur.

Yedi hedefli Node test dosyası geçti; komutlar devir notunda. Altın çeviri
CLI'sı 15 knownGood + 16 expectedRepairs örneğini sıfır blocking hata ile
geçti. Windows'ta mevcut misc-exports-deadzone testi önce sandbox EPERM,
normal yetkide spawn true ENOENT verdi. Güncel çalışma dalında zaten
bulunan portable process.execPath yaklaşımı master tabanlı bu PR'a taşındı;
yeni ürün bug'u diye sayılmadı. Testin 17 senaryosu sonra geçti.

Altın CLI'ya ilk --help çağrısı, araç bu seçeneği desteklemediğinden dosya
adı sayılıp ENOENT verdi; doğru argümansız çalıştırma geçti. Bu düzenek
denemesi ürün hatası diye sayılmadı. Node syntax ve git diff kontrolü geçti.

UI, GPU/model, canlı YouTube, start.bat ve tam npm test çalıştırılmadı.
Yeni paket, şema veya kullanıcı verisi değişikliği yok. Düzeltme kalite
denetimi/karşılaştırma araçlarını etkiler; modelin çeviri kalitesini
iyileştirdiği veya tüm çeviri hattını doğruladığı iddia edilmez.
