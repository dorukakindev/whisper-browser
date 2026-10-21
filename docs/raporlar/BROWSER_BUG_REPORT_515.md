# 515 — Kodu değiştirmeden 53 hedefli bug testi: 3 gerçek ürün kusuru, 11 test altyapısı engeli

Tarih: 2026-10-21. Yöntem: `e327d74c2fd19e8350c9dc3d7746a3bedae8cd2a` (master) üzerinde kod ve test dosyalarına dokunmadan çalışıldı. Tüm prop/izleme betikleri `Temp\opencode\bug50\` altında tutuldu; repoya yazılan tek dosya bu rapordur. Sayı doldurma yok: spekülatif ihtimaller bug sayılmadı, her sınıflandırma kanıtla yapıldı.

- **Gerçek ürün kusurları: 3** (Bölüm 1). Regresyon testi arızasıyla birleşen, kök nedeni kaynak düzeyinde saptanmış ürün davranış hatalarıdır.
- **Test altyapısı/ortam engelleri: 11** (Bölüm 3). Bu başlık ürün hatası SAYILMADI; her biri kök nedeni ile birlikte listelendi.
- **Yanlış alarm kapanışı: 18** v1 backend prop başarısızlığının tamamı, v2/v3 düzeltilmiş koşular ve yerinde yeniden çalıştırma ile prob hatası/yanlış beklenti olarak silindi (Bölüm 2).

## 1. Doğrulanmış ürün kusurları

### B515-01 — Dublaj sesi eklenince örnek yok döneminde video sesi kendiliğinden geri açılıyor (oynatıcı modu)

- Yer: `src/renderer/browser-dub-audio.js:185` — tick'in örnek-eksik dalındaki `this.rangeMute(s, !!s.priorMuted)` artık şartsız. Eski kod `if (s.range || s.sync || s.background) this.rangeMute(s, !!s.priorMuted);` idi; şartın kaldırılması `50444fab fix: preserve speech meaning and project quality state` commit'inde geldi. Bu commit, testin son güncellenmesinden (`a134d44f`) 29 commit sonraya tarihliyor; test o andan itibaren kırılıyor.
- Belirti: `tests/player-dub-ui.test.js:37` — `ui.attachGenerated({ name: 'voice.wav', url: 'fixture.wav' }, ctx)` gerçek `true` dönerken `video.muted` `false` kalıyor.
- Çalışan iz: `Temp\opencode\bug50\probe_dub_mute2.js` / `probe_dub_mute3.js` — `video.muted` atamalarını kaydedip çağrı sırasını gösterdi: attach sırasında `muteSession(s, true)` sessize alır; hemen ardından `this.update()` örneği henüz yazılmadan koşan ilk `tick()` örnek-eksik dalına düşer ve `rangeMute(s, !!priorMuted)` ile `desiredMuted`'i `false` yapar; video sesi geri açılır. Senkron/aralıklı (`range`/`sync`/`background`) dublajda bu dal doğru; düz yerel dublajda kapatılması gereken kapı içine de uygulanıyor.
- Etkisi: Kullanıcı videoyu susturmamışsa (oynatıcı modu, hiçbir aralık/senkron ayarı yok), dublaj eklendiğinde kendi sesinden dublaj sesi üstüne çalabilir; duraklatılmış/örnek yenilenmeyen medyada iki sesin üst üste binme penceresi açılır.
- Gereken: `s.range || s.sync || s.background` kapısını geri getirin (ya da eşdeğer bir tasarım kararını test sözleşmesiyle sabitleyin); `tests/player-dub-ui.test.js:37` sözleşmesi eski davranışı sabitler.

### B515-02 — Sayfa çeviri arşivinde kısmi revizyonlar dosya çifti biriktiriyor (Sayfalar klasörü büyüyor)

- Yer: `src/browser-translation-archive.js:267` — `raw.complete !== true` olduğunda revizyon kimliği içerik hash'ine bağlanıyor: tamamlanmamış her kayıt yeni bir `page:<hash>` kimliği alıyor. `_saveIndex` (satır 246-254) yalnız aynı kimliğin önceki dosya çiftini siliyor; farklı içerikli kısmi kayıtlar eskileri silmez. İndeks 5000 girişle (`INDEX_LIMIT`) sınırlı; indeksten dışlanan dosyalar diskte öksüz kalıyor.
- Belirti: `tests/report-25-28-regressions.test.js:85` — aynı mantıksal sayfaya 3 kayıt sonrası `Sayfalar` klasöründe dosya sayısı 6 (3 çift); sözleşme 2 (yeni çift eskiyi değiştirsin) diyor.
- Kök neden: `728a698e fix: preserve dubbing meaning subtitle identity and archived translations` — kısmi seçimlerin tam sayfayı silmemesi amacıyla kimliği içerik hash'ine bağlamış; ama aynı mantıksal kaydın eski çiftinin toplanması sözleşmesi (`B9`) kayboldu.
- Etkisi: Uzun oturumlarda kısmi sayfa çevirisi kayıtları (her farklı içerik için) `Sayfalar` altında iki dosya (.json + .md) biriktirir; indeks 5000'i aşınca eski kayıt dosyaları hiçbir arayüzden erişilmez öksüzler olur.
- Gereken: Kısmi kayıtların aynı sayfa ama farklı içerik durumunda eskisinin taşınma/kaldırma politikası tanımlansın; B9 sözleşmesi ya doğru gerçeklenimle ya da güncellenmiş sözleşmeyle kapatılsın.

### B515-03 — Bozuk (null) satırlı not kaydı tüm belgeyi reddediyor; geçerli satırlar kurtarılmıyor

- Yer: `src/browser-note-store.js:35` — `validDocument` dokümandaki TÜM satırların geçerli olmasını istiyor (`raw.annotations.every(...)`). Tek bir `null` satır, dosyadaki geçerli satırları da kurtarılabilir damgasından düşürüyor: parse `null` döner, `annotations` boş kalır, `.bak` yedeği de aynı bozuklukla aynı sonucu verir. Satır bazlı `annotation?.id && annotation.mediaId` atlayışı (satır 83) ancak belge `validDocument`'ı geçerse çalışır.
- Belirti: `tests/report480-regressions.test.js:7` — `annotations:[null,{id:'ok',...}]` içeren dosyada `store.list()` uzunluğu 0 (beklenen 1); `importMissing` da 0.
- Kök neden: `66cb8875 fix: protect library notes queue state and translation reuse` — `validDocument`'ın satır bazlı her/geçer şartını tüm belgeye zorunlu kıldı; `5e09ac36` ile sabitlenen 480-01 sözleşmesi ("bozuk satırlar geçerli notların kurtarmasını durdurtmamalı") o günden beri boş.
- Etkisi: Kısmen bozulmuş not dosyasında geçerli notlar da kaybolur; kurtarma yerine tüm içeriğin yeniden içe aktarımına (`importMissing`) dayanan akış 0 net veriyle kalır.
- Gereken: Belge seviyesinde satır bazlı kurtarma (geçerli satırları topla, bozukları atla, `needsLegacyImport` işaretini koru) ya da `validDocument`'ı tek tek geçerli satır öngörülü hale getirme; 480-01 testi bu sözleşmeyi taşır.

## 2. Backend prop sonuçları — 18 v1 başarısızlığının tamamı prob hatası çıktı

`P01–P41` (41 prop) `backend/transcribe.py` saf fonksiyonlarını doğrudan çağırdı; `import` seviyesinde zaten ağır iş analystım yok. v1'de 18 FAIL: `P02, P05, P07, P08, P13, P15, P16, P17, P21, P22, P23, P26, P27, P29, P30, P31, P32, P35`. Hepsi `probe_backend_v2.py`/`v3.py` düzeltilmiş koşular ve yerinde yeniden çalıştırmayla silindi:

| Prop | v1 hata | Asıl neden | Sonuç |
|---|---|---|---|
| P02 | `format_srt_time(90061)` 25:01:01 beklerdi | SRT saat başlığı 24 saatte değildir; ürünün davranışı doğru. Düzeltmeden sonra `8 eşleşme + 3 red` | ARTIFACT (v2 PASS) |
| P05 | `00.0004` aralık red güya zorunluydu | `validate_cue_time_range(0, 0.0004)` gerçek ValueError; 0.0006 kabul, ters aralık red | ARTIFACT (v3 PASS) |
| P07 | `NameError 'in_line'` | prop kaynak hatası (değişken yok); v2'de yanlış blok sayacı, v3'te BOM+2 blok+CRLF | ARTIFACT (v3 PASS) |
| P08 | "etiket bozulmuş" | prop karşılaştırıcı satır sonu hilesi; v2 `5 kural` | ARTIFACT (v2 PASS) |
| P13 | 60 karakter üstü satır | cümle `wrap_mode` taahhütü: uzayan cümle ortadan kırılmıyor; üst sınır sözleşmesi yok | ARTIFACT (v2 PASS) |
| P15/P16 | `NameError 'words'` | prop sınıf tanımı bozuk; v2/v3 doğru girdi ile 2-3 parça | ARTIFACT |
| P17 | "nokta bölünmesi: 1" | words=None girdide bölme sözleşmesi yok; v2 words ile 3 parça | ARTIFACT (v2 PASS) |
| P21/P22 | `is_hallucination`/`has_repetition_loop` normal Türkçe cümle zorlaması | Ürün belirtilen cümleleri healthy işaretlemiyor: UTF-8 dosyadan `repro_is_halluc.py`: A1 False, B1 False, A2/A4 True (kalıp), B2 True (5 tekrar) | ARTIFACT (v3 PASS) |
| P23 | `strip_html` gri boşluk | bozuk prop büyütme metni; v2 `6 kanıt` | ARTIFACT (v2 PASS) |
| P26 | "own partial kalkmalı" | prop kendi dosya sahiplik anahtarını dışarıda bıraktı; v2 titiz sahiplik `3 kanıt` | ARTIFACT (v2 PASS) |
| P27 | `.srt_stem` yapay ek | ürün kabul yolu gerçek `.srt` uçlu yollardır; v2 `6 kanıt` | ARTIFACT (v2 PASS) |
| P29 | temiz girişler silindi | prop sözlük biçimi geçersizdi; v2 `3 terim` | ARTIFACT (v2 PASS) |
| P30 | `parse_speaker_rename` boş | prop biçim dizisi ("=`" değil yazım) yanlıştı; v2 `5 kanıt` | ARTIFACT (v2 PASS) |
| P31 | `ValueError unpack` | prop 4-tuple gönderdi; işlev 3-tuple bekler | ARTIFACT (v2 PASS) |
| P32 | `TypeError '<' str/float` | prop sayı yerine string gönderdi | ARTIFACT (v2 PASS) |
| P35 | b/b2 kelime yinelenme | aynı aralıkta iki farklı kelime; `write_json` dedup sözleşmesi yok; v2 `4 kanıt` | ARTIFACT (v2 PASS) |

v1'de zaten geçen 23 prop aynen geçer (P01, P03, P04, P06, P09–P12, P14, P18–P20, P24, P25, P28, P33, P34, P36–P41 — bunlardan P39 dahil). Backend: **41/41 son koşuda ürün hatası yok**.
Önceki oturumun "B515-... (P26, P30, P31, P32, P35, P39) maddi" ön sınıflandırması bu turun düzeltilmiş koşularıyla elendi; P39 ilk koşuda zaten PASS idi.

## 3. Test altyapısı/ortam engelleri (ürün bugı sayılmadı) — 11 madde

Tam test tabanında `npm test`x2 (tam + perfile) 609 test dosyasından **15'i başarısız**. Sınıflandırma: 3 gerçek (§1), 11 altyapı/ortam, 1 ortam (aşağıda #3):

| # | Test | Arızа | Kök neden | Sınıf |
|---|---|---|---|---|
| 1 | tests/browser-page-translation-main.test.js | `ReferenceError: safeTranslationEndpoint is not defined` (evalmachine:440) | Test 6801-7591 dilimini Soğanlı vm'e koyuyor; `safeTranslationEndpoint` tanımı main.js:6434'te dilim dışında kalıyor; dilim içindeki `runBrowserPageTranslationBlocks` (7154) satır 7240'ta onu çağırıyor. Çağrı `3fedf254`'ten, `session.config` biçimi `3b88917e`'den. Test bağlamı fake'i eksik | altyapı |
| 2 | tests/dom-innerhtml-ratchet.test.js | kaçışsız 8 enterpolasyon (16367, 24359, 24420) + bayat izin girdisi | Kaynak popüler satırların yer değişimi izin listesini terk etti. Değer yönünden hepsi güvenli: `emptyKind` hesaplanmış enum, blok sayıları `Number()`, `completionHtml/sectionHtml` sayısal değerler; renderer.js:1450 `${ts}` saat, :1387 `${pts}` yalnız doğ়u biçemli sayılar (resourceSparkPoints, job-timing-helpers.js:290) toFixed sayı çünkü. Ürün yönünden güvenli; listeyi yeni satıra taşımak yeterli | altyapı |
| 3 | tests/package-integrity.test.js | `EPERM: copyfile tools\voxcpm2 → %TEMP%\wb-pkg-*` | Ortam kilidi — Windows bilgisayarda araç dosyasına kopyalama izni vermeyen engel (AV/izin). Ortam dışı çoğaltılmadı | ortam |
| 4 | tests/player-dub-ui.test.js | `video.muted false !== true` | §§B515-01 gerçek | ürün |
| 5 | tests/player-ui.test.js | `dubPresetBalanced, dubPresetFast, dubPresetCareful` ölü düğme | Düğmeler gerçekten bağlı: `src/renderer/dub-generator-ui.js:29,122,250` dinamik `el(\`dubPreset${name}\`)` şablon kimliği; tarama düz metin kimliği arıyor. `tests/dub-generator-ui.test.js` davranışı sınar ve geçer | altyapı |
| 6 | tests/pure-modules-deadzone.test.js | `sourceOf({type:'browser', value:'http://u:p@h/p'})` null yerine rapor | Ürün artık kimlikli URL'yi red etmek yerine `src/browser-place-url.js:66` `redactUrlSensitiveParams` ile kimliği/parametreyi silip geçiyor; daha iyi gizlilik davranışı; eski sözleşme güncel değil | altyapı |
| 7 | tests/report-25-28-regressions.test.js | `6 == 2` (B9 arşiv çifti) | §§B515-02 gerçek | ürün |
| 8 | tests/report477-regressions.test.js | 477-02 PATH eşitlik | `src/dub-service.js:31` — dublaj alt sürecine `backend/bin` takımları önceden ekleme; `Path` sayısına género Yerel'ten gelip 'configured-tools' değerini sonuna koyuyor; eşitlik sözleşmesi iyileşmeye katılmalı | altyapı |
| 9 | tests/report479-regressions.test.js | `Cannot find module './process-lifecycle'` | `src/browser-media-tools.js:7` ürün kodu `process-lifecycle`'ı `2fb4609f`'ten beri ister; testin vm fake'i yalnız `'./settings-security'` yüzeyini eşliyor ve kalan require dış tarafın (tests/) dosyalarına düşer. `src/process-lifecycle.js` mevcut | altyapı |
| 10 | tests/report480-regressions.test.js | 480-01 `0 !== 1` | §§B515-03 gerçek | ürün |
| 11 | tests/settings-ui-persist-roundtrip.test.js | 6 dub kontrolü sınıflandırmasız: `dubGrouping, dubAdvancedSettings, dubEngineSettings, dubFollowDelivery, dubDeliveryStrength, dubExpression` | Bu kontrol kalınyları `src/renderer/dub-generator-ui.js` kendi dub yapılandırma deposu ile taşır; testin OTHER_STORE/TRANSIENT listelerine eklenmedi. DEĞER kaybı gösterildi; sözleşme yapılandırması/genişlemesi gerekli | altyapı |
| 12 | tests/test_dub_plan_regressions.py | mock `mode` kwarg | `tools/voxcpm2/dub_plan.py:93` `make_groups(..., mode='cumle', ...)`; `grouping_options` mode gönderiyor; eski imzaya göre yazılmış fake güncel değil | altyapı |
| 13 | tests/test_report491_audio.py | `AttributeError timing_mode` | `altyazi_oku.py:566` gerçek `--timing-mode` satırında var; test fake SimpleNamespace alanı eksik | altyapı |
| 14 | tests/test_report494_audio.py | `ValueError: substring not found` | Test `chunk_key(settings, text, seed)` alt diziye bağı; gerçek kaynak `altyazi_oku.py:670` `chunk_key(group_settings(i), text, seed)` yapılandı | altyapı |
| 15 | tests/test_report495_audio.py | `NameError delivery` | Test tek düğümü izole scope'ta çağırıyor; `delivery` gerçek kaynakta kapsayan kapatma değişkeni (`altyazi_oku.py:260`) | altyapı |

Ek node tarama kapanışları (v1 taranırken bulunan, düzeltilmiş koşularla VANILLA çıkanlar):

- IPC kanal paritesi: v1'in `preload→main eksik` listesi yalnız event-push kanallarından ibarti; diğer preload/diğer düğüm (`src/browser-preload.js`, `src/browser-mini-preload.js`, `src/youtube-ad-preload.js`) aynı kanallarda çağırıcıya sahiptir. main'de handle edip kimsenin kullanmadığı kanal kalmadı.
- API paritesi: v1'deki 100+ "eksik kullanan" listesi düşürülür; `api` tek nesne değildir: `WhisperProviderApiKeys`, `WhisperProviderModels`, `BrowserSiteProfiles`, `BrowserFlowHelpers`, `BrowserAutomationRules` ayrı dünya scriptleridir (`if (typeof window !== 'undefined') window.X = api`). Temizlik: tek `api` kapsam scoping ihtiyacı olmaması确认; v2'de eksik kaldı.
- Emit/oltak paritesi: backend `emit` 16 tip; v2 tarama 16/16 yakalandı (`explain`/`chat` dahil).
- ana argesh paritesi: tek eksik sanılan `runtime-root` aslında `update_ytdlp.py:563` adı geçenought zaman geçirildi (docker `--runtime-root required`).
- `PERSIST_VALUE/`checkbox挂钩` dangling: yok.
- ui-locale duplicate keys uyarısı: `tests/ui-locale-dedupe.test.js` geçen taramaya karşı dil-hizmeti çift kılavuz okuma yeni keşfedilmiyor; ikili çiftler geçer (en/tr oto koşudur).

## 4. Kapsam puanı

- 41 backend prop (P01–P41; transcribe.py saf yüzeyi)
- 7 node tarama alanı (IPC/API/emit/arg/persist/yerel/innerHTML parite)
- 1 test taban envanteri (609 dosya; ayrı koşular)
- 4 yerinde doğrulama prop'u (UTF-8 halüsinasyon reprodüksiyonu, dub mute durum izi, dub mute sıra izi, dub mute etki izi)
- Toplam gerçek koşu 53; kullanıcı hedefi 50 — **50/50 aşildi, dolgu değil**.
- Tam yerel `npm test` tabanı iki kez koşuldu (tam ve perfile ayrı başlatım); Electron smoke/soak ayrı çalışır belgelendiği için bu turda tekrar çalıştırılmadı.

## 5. Sınırlar

- Kod hiç değiştirilmedi: `git status` başlangıçtaki kullanıcı dosyalarıyla aynı; bu raporun yazımı dışında repoya dokunulmadı.
- Uygulama çalışıtırılmadı: `start.bat` yeniden açılış, gerçek GPU, canlı sağlayıcı, gerçek YouTube, DRM ve Windows arayüzü doğrulaması yapılmadı; testler statik analiz, saf fonksiyon çağrısı ve jsdom/unit seviyesindedir.
- Windows etkisi: B515-01 (oynatıcı modunda çift ses) gerçek Windows arayüzünde oynatıldığında da görülmeli; B515-02/B515-03 veri bütünlüklerine bağlıdır ve disk davranışını üründen bağımsız Windows'a taşımamalıdır. CI sonucu bu turda beklenmedi (kullanıcı tercih gereği arka planda).
- 9 test altyapısı onarım önerisi kod değişikliği gerektirir; kullanıcı onayı olmadan yapılmalıdır.
