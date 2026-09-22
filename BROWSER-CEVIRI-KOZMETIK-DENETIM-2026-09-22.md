# Tarayıcı · Çeviri · Kozmetik Denetimi — 2026-09-22

Dal: `fix/browser-translate-cosmetic-audit-2026-09-22` (taban: `5dffbe8`, `origin/master` #24)

Kapsam: yerleşik tarayıcı kabuğu (adres çubuğu, sekmeler, arama filtreleri, site/sayfa ayarları),
çeviri boru hattı (altyazı LLM çevirisi, çeviri belleği, yalnız-çeviri modu, sayfa çevirisi,
tarayıcı çeviri zamanlayıcısı, PDF) ve arayüz kozmetiği (token'lar, açık/koyu tema kontrastı,
EN yerelleştirme, azaltılmış hareket).

Her bulgu gerçek kodu somut girdiyle çalıştırarak doğrulandı. Her düzeltmenin bir regresyon
testi var. Bu testler düzeltme öncesi kodda **başarısız**, sonrasında **geçer**:

- `tests/audit-2026-09-22-browser-translate.test.js` — 18 test. Düzeltme öncesi 0/18, sonrası 18/18.
- `backend/test_translation_audit_2026_09_22.py` — 7 test. Düzeltme öncesi içe aktarma hatası veriyor, sonrası OK.

## Test sonucu

| Paket | Sonuç |
|---|---|
| Node `tests/*.test.js` | **244/252 geçti** (taban `5dffbe8`: 243/251) |
| Python `backend/test_*.py` | **21/24 geçti** |

Başarısız olan 8 Node ve 3 Python dosyasının hepsi ortam kaynaklı. Tabanda da aynı şekilde
başarısızdılar. Bu ortamda npm ve PyPI kayıtlarına erişim kapalıydı:

- `jsdom`, `mux.js`, `mp4box`, `darkreader` bulunamadı.
- Python paketleri `srt`, `guessit`, `genanki`, `yt_dlp`, `faster_whisper` bulunamadı.
- OCR bağımlılıkları eksik.

İki mevcut test (`browser-downloads`, `browser-places-filter`) renderer'dan kod kesip çalıştırıyor.
Bu testler yeni `foldSearch` yardımcısını da yükleyecek şekilde güncellendi. `browser-foundation`
testindeki kaynak kalıbı da yeni katlama yardımcısına göre güncellendi.

Yerelde tam doğrulama için şunları çalıştırın:

```bat
npm ci
npm test
npm run test:electron
```

## Düzeltilen bulgular

### Çeviri

| # | Önem | Bulgu | Düzeltme |
|---|---|---|---|
| Ç1 | Yüksek | Model blokları `"1".."n"` diye numaralandırınca her cue bir öncekinin çevirisini alıyordu. Bu kaymış sonuç önbelleğe de yazılıyordu. Gruplar tek tek doğrulandığı için yalnızca eksik `"0"` reddediliyordu. | `reply_id_range_issue()` eklendi. Aralık dışında kimlik gelirse paketin tamamı reddedilir ve küçük paketlerle yeniden denenir. Aynı kontrol 2. geçişte (refine) de var. |
| Ç2 | Yüksek | Sayfa çevirisi uygulanırken aynı metin düğümüne iki kez yazılıyor (önce orijinal, sonra çeviri). MutationObserver'ın ikinci kaydı "sayfa değişti" sanılıyordu. Sonuç: "Orijinali göster" Türkçeyi gösteriyordu ve blok yeniden çeviriye gönderiliyordu. | `ownWrites` artık eşleşince silinmiyor. Düğümdeki değer son yazdığımız değerse kayıt bizimdir. Gerçek SPA değişikliği hâlâ yakalanıyor ve bu da test ediliyor. |
| Ç3 | Yüksek | Bulanık çeviri belleği "possible→impossible", "legal→illegal" gibi anlamı tersine çeviren ekleri yazım varyantı sayıyordu. Kullanıcı kaynağı düzeltip yeniden çevirse bile eski ("mümkün") çeviri geri geliyordu. | Sözcüğün başına ya da sonuna tam harf eklenmişse eşleşme reddedilir. |
| Ç4 | Orta-Yüksek | Yalnız-çeviri çıktı adı her 2–3 harfli son parçayı dil kodu sanıyordu. Örnek: `Dune.Part.Two.srt → Dune.Part.tr.srt`. Part One ile Part Two aynı dosyaya yazılıp birbirini eziyordu. | `split_subtitle_language_suffix()` yalnız bilinen dil kodlarını kaldırır ve `forced`/`sdh` niteleyicilerini korur. Renderer'daki dil rozeti de aynı kümeyi kullanır. |
| Ç5 | Orta | Devre kesici açıldıktan sonra "Başarısızları yeniden dene" tüm izi (200 cümle → 200 istek) kuyruğa alıyordu. | Hiç denenmemiş cümleler `deferred` işaretlenir. Yeniden denemede yalnız oynatma penceresi yeniden planlanır, gerçekten düşmüş cümleler ise kuyruğa girer. |
| Ç6 | Orta | Yeniden denemeden sonra tek bir geçici 503 devreyi yeniden açıyordu, çünkü sayaç sıfırlanmıyordu. | `retryFailed()` içinde `consecutiveProviderFailures = 0` yapılır. |
| Ç7 | Orta | Arapça/İbranice PDF satırlarında sözcük sırası ters çıkıyordu. | Satırdaki öğelerin çoğunluğu `dir==='rtl'` ise birleştirme azalan X sırasıyla yapılır. |
| Ç8 | Düşük | ASS girdisinde `\h` karakteri metne ve modele "Mr.\hSmith" olarak sızıyordu. | `\h` bölünmez boşluğa (U+00A0) çevrilir. |
| Ç9 | Düşük | Sağdan sola hedef dilde sayfa çeviri katmanında `dir` özniteliği yoktu. | `ar/fa/he/ur…` için `dir="rtl"`, diğer diller için `dir="auto"` verilir. |

### Tarayıcı

| # | Önem | Bulgu | Düzeltme |
|---|---|---|---|
| T1 | Yüksek | Adres çubuğunda "weather" + Enter eski bir geçmiş kaydını açıyordu. "news" + Enter açık bir sekmeye geçiyordu. "2020-2021" + Enter panoya "-1" kopyalıyordu. | Varsayılan ilk satır artık her zaman yazılan metindir (Chrome davranışı). Hesap, sekme ve geçmiş satırları altta kalır. |
| T2 | Orta | Enter 130 ms'lik debounce içinde basılırsa önceki metnin sonuçları kullanılıyordu. | `player.browserAddressQuery` ile tazelik kontrolü yapılır. Sonuç bayatsa yazılana gidilir. |
| T3 | Yüksek | `toLocaleLowerCase('tr')` ASCII "I"yı "ı" yapıyordu. Bu yüzden "interstellar" araması "Interstellar"ı, "i think" araması "I think"i bulamıyordu. Sorun yer imleri, omnibox, cue listesi, indirmeler, geçmiş, tanı ve yeniden eşleme aramalarında vardı. | Ortak `foldSearch()` / `BrowserOmnibox.foldSearchText()` eklendi: I/İ/ı → i. Uzunluğu korur, böylece vurgu konumları doğru kalır. |
| T4 | Orta-Yüksek | "Not: süt al", "Re: toplantı" gibi aramalar "Geçerli bir http veya https adresi girin" hatası veriyordu. | Yalnız gerçek şemalar (`javascript:`, `file:`, `data:`, `x://`…) ve `C:\` yolları engellenir. Geri kalan her şey arama olarak gider. |
| T5 | Orta | `192.168.1.1`, `10.x`, `172.16–31.x`, `fe80::`, `nas:5000` gibi adresler https'e zorlanıyordu. Yalnız http sunan modem ve NAS sayfaları açılmıyordu. | Özel, link-local ve tek etiketli+port adresleri `http` ile açılır. Genel adresler https olarak kalır. |
| T6 | Orta | Sekme grupları varken Ctrl+Tab ve Ctrl+1..9 ekrandaki sırayı değil ham diziyi izliyordu. Daraltılmış gruptaki gizli sekmelere de atlıyordu. | `visibleBrowserTabsInDisplayOrder()` eklendi. |
| T7 | Düşük-Orta | "Görseli kaydet" uzantıyı URL'den alıyordu: `photo.jpg` WebP olsa bile .jpg kaydediliyordu, AVIF ve ICO dosyaları da .jpg oluyordu. | Uzantı Content-Type'tan belirlenir. Diyalog filtrelerine avif, ico ve bmp eklendi. |
| T8 | Düşük | Markdown bağlantısı `)` karakterini kodlamıyordu, bu yüzden bağlantı kırılıyordu (`encodeURIComponent` parantezleri kodlamaz). | Açık bir eşleme kullanılır: `%28`, `%29`, `%5C`. |
| T9 | Düşük | Hesaplayıcı `-2^2` ifadesine `4` diyordu. | Tekli eksinin önceliği 2.5'e indirildi. Önek işleç yığından hiçbir şey çıkarmaz, böylece `2^-1 = 0.5` doğru kalır. |
| T10 | Düşük | 200 sayfa ayarı doluyken yeni bir sayfa için `ok:true` dönüyor, ayar kalıcılaştırılırken sessizce atılıyordu. | Site düzeyindeki gibi `reason:'limit'` döner ve kullanıcıya Türkçe bir mesaj gösterilir. |

### Kozmetik

Önce/sonra ekran görüntüleri `docs/devir/evidence/2026-09-22-browser-ceviri-kozmetik/` altında.
Görüntüler başsız Chromium'da, `window.api` saplanmış bir renderer kopyasıyla alındı.

| # | Bulgu | Düzeltme |
|---|---|---|
| K1 | Açık temada adres önerisi açılır listesi koyu zeminli kalıyordu (`#11161b`). Kontrast 1.04–1.17:1 idi. | Zemin `var(--bg-2)` yapıldı. İkincil metin `--text-dim`, seçili satır `--accent-soft` oldu. |
| K2 | 10 token hiç tanımlanmamıştı ve 88 başvuruda geri dönüş değeri yoktu: `--bg-card`, `--fg`, `--muted`, `--amber` ve diğerleri. Etkisi: sekme önizlemesi ve SmartTube yüzeyi saydam, çeviri uyarı kenarları kayıp. | `:root` içinde bu adlar kanonik token'lara bağlandı. Test, tanımsız token kalmadığını doğruluyor. |
| K3 | Açık temada oynatıcı, SmartTube ve çift dilli liste neredeyse beyaz metinle çiziliyordu (1.03–1.43:1). | `html[data-theme="light"] .player-layer` için `--player-*` token'ları tema token'larına bağlandı. |
| K4 | `.btn { border:none }` kuralı outline düğmelerin kenarını siliyordu. Açık temada metin 1.35:1 idi. | `.btn.action-button-outline` eklendi. Devre dışı `#makeSubsBtn` artık gölge almıyor. |
| K5 | "Sayfada bul" girdisi tarayıcının varsayılan stilindeydi. | Token'larla 30 px yükseklik, kenar ve köşe yarıçapı verildi. |
| K6 | Açık temada yer imleri ve indirmeler panelindeki kontroller ile `.lang-chip` ve `.mini-toggle` 1.8–3.0:1 kontrasttaydı. | Açık temaya özel token renkleri verildi. |
| K7 | Azaltılmış harekette yüklenen sekme, etkin sekmeyle aynı görünüyordu. | Durağan, kesikli bir çizgi kullanılıyor. |
| K8 | Açık temada `--info` rengi AA altındaydı. `--accent-hover` ile `--accent` aynıydı, bu yüzden hover değişimi görünmüyordu. | `--info` `#2b5d6b`, `--accent-hover` `#6a3e0f` yapıldı. |
| K9 | EN arayüzde tarayıcı kabuğunda Türkçe metin kalıyordu: "WHISPER TARAYICI", "Adres gir", ipuçları ve sekme şeridinin aria-label'ı. | Eksik 30 giriş eklendi. Liste kapsayıcısının kendi öznitelikleri artık çevriliyor, içindeki site verisi korunuyor. "Retranslate all" kısaltıldı; tam açıklama ipucunda. |

## Bilerek düzeltilmeyenler (karar gerektirir)

1. **Geri açılan veya geri yüklenen sekme `#çapa` ve `?ref=` bilgisini kaybediyor.** `safePlaceUrl` fragment'leri bilerek siler; `settings-security` testi `#SENTINEL_HASH` örneğiyle bunu güvence altına alır. Düz çapaları korumak gizlilik kararı gerektirir. Öneri: düz çapaları yalnız oturum deposunda tutmak, yedek ve dışa aktarmada silmeye devam etmek.
2. **ASS'deki `{\an8}` ve `{\i1}` etiketleri çeviride kayboluyor.** Bunları korumak için etiketleri metinden ayırıp çıktıda geri eklemek gerekir. Bu, prompt ve blok sözleşmesinde değişiklik demek; ayrı bir iş olarak ele alınmalı.
3. **Açık temada sabit renkli 258 aday kural var.** Çoğu çalışma zamanında eziliyor. Yalnız görünür olanlar düzeltildi; tam temizlik ayrı bir iş.
4. **EN yerelleştirmede kalan bağlamlı parçalar var**: "Mevcut bir", "ve", yol örnekleri gibi. Bunlar kodda cümle olarak birleştirilmeli.
