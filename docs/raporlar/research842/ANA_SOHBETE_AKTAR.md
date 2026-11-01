# R842 araştırmasını geliştirme sohbetine aktarma

Bu belge uygulama yapıldığı veya bütün kartların onaylandığı anlamına gelmez. Kullanıcı seçtiği paketi ana geliştirme sohbetinde istemek için bu özeti kullanabilir. Ana rapor [R842](../BROWSER_BUG_REPORT_842.md); ayrıntılı [RSS tasarımı ve kod örnekleri](rss/RSS_MEDIA_LIBRARY_BLUEPRINT.md).

## Ürün yönü

Whisper/Luna bir medya kütüphanesidir. Film/dizi/bölüm, yerel dosya/kesim, bonus video, web kaynağı ve RSS girdisi ayrı nesneler olmalı. RSS'de eleştiri okumak filmi izlenmiş yapmaz. Asistan yalnız seçili ve kimliği doğrulanmış kütüphane kaynakları üzerinden gerekçeli cevap üretmeli. Grafit/amber, varsayılan EN/TR, gerçek Windows ve dar ekran kabulü korunmalı. Yeni müzik analizi paketi hedefi eklenmemeli.

## Kullanıcının seçebileceği ilk paketler

- **RSS/Akışlar ilk sürüm:** URL/site discovery+preview; RSS/Atom parser ve gerekirse JSON adapter; bounded main fetch; feed-entry/read-state kalıcılığı; Tümü/Makale/Video/Podcast; manual refresh, hata/son başarı, offline eski içerik; OPML preview/export; mevcut Browser reader ve podcast oynatıcı. R842-01–05/08/09/14–20. Mevcut YouTube Atom/OPML/podcast yollarını bozma.
- **Medya kütüphanesi temeli:** L842-01/02/03 eser/sürüm/parça/bonus ayrımı; L06 NFO salt okunur preview; L07 alan kilidi; sonrasında L08 seçili klasör fark gelen kutusu. Kaynak dosya taşımayı/silmeyi ilk pakete katma.
- **Asistan kanıt araması:** A842-04/05 alias+çoklu arama birleşimi; A06 parent bölüm; A08 film/kaynak/zaman düzeni. Önce seçili küçük Türkçe/İngilizce corpus'ta mevcut lexical yöntemle karşılaştır; graph/video modelini ilk bağımlılık yapma.

## RSS için kaynakta gerçekten bulunanlar

Karakeep feedWorker/parser/FeedSettings: saatlik idempotent kuyruk, guid→id→link, source:RSS bookmark, ayrı import kaydı. Miniflux: autodiscovery, RSS/Atom/JSON/RDF normalizasyonu, HTTP validator ve bounded body. Folo: içerik türüne özel kart ve unified discovery; istemci remoteAPI kullanır, server'ın otomatik yerel olduğu varsayılmaz. RSSHub: siteye özel adapter, Radar ve cache; Letterboxd diary adapter'ı zaten resmî kullanıcı RSS'sini okur. rss-parser XML parseString pilot adayı; JSONFeed onun hazır özelliği değildir.

## Kabulün önemli parçaları

Feed ID/GUID çakışması, aynı URL farklı feed provenance,304koruma,200bozukXMLsonrası retry,decode/CPU/bellek sınırı,partial import,feed taşınması,app-close/catch-up,mark-all snapshot,okundu≠izlendi,remakeonayı,podcastkonumu,TRUTF-8,Windowsproxy/uyku/DPI/CSP. Her pakette yalnız somut davranışı doğrulayan kısa hedefli test; UI için start.bat ve gerçek Windows görüntüsü. Raporun6public ekranı bizim ürün UI kabulü değildir.

## Yetki ve teslim sınırı

Araştırma tabanı df972383ab5a9b736b832ba64401b206beb6dedc; hiçbir ürün önerisi uygulanmadı. Mevcut kod ve başkasının değişiklikleri tekrar kontrol edilmeli. Lisansı ve seçili dosyası incelenmiş küçük port/adaptör tercih edilir; bütün upstream stack'i/özel servis zorunlu yapılmaz. Yeni bağımlılık/şema/örnek veri anahtar ve kişisel medya taşımamalı. Eski raporlar korunmalı. Uygulama paketini kullanıcı seçtikten sonra normal proje teslim döngüsü izlenir.
