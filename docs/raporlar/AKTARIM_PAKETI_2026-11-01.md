# Ana sohbete rapor aktarım paketleri — 1 Kasım 2026

Kullanıcı bütün düzeltilmemiş bug/geliştirme/ekleme/GitHub araştırma raporlarını dosya yolları veya ZIP olarak istedi. Bu çalışma yeni bug denetimi değildir; raporlar paketlendi, son belge durumları ayrıldı. Hiçbir ürün düzeltmesi yapılmadı ve eski raporlar değiştirilmedi.

## Yerel teslim

Klasör: `D:\Whisper Local\exports\ANA_SOHBET_RAPORLARI_2026-11-01-1953\`

| Dosya | Amaç | Boyut | İçerik |
|---|---|---:|---|
| `01_ODAKLI_ACIK_RAPORLAR.zip` | Önce ana sohbete verilecek paket | 4.694.776 byte | 88 rapor/ek Markdown;480kaynak belge/kanıt;4üretilmiş indeks/manifest;484ZIP girdisi |
| `02_TUM_TARIHSEL_RAPORLAR.zip` | Eksik kalmasın diye tam tarihsel metin arşivi | 13.239.917 byte | 1.087rapor/ek Markdown;3.266kaynak belge/kanıt;4üretilmiş indeks/manifest;3.270ZIP girdisi |
| `00_ONCE_BUNU_OKU.md` | Okuma sırası ve son durum ayrımı | — | Açık raporlar, araştırmalar, son tasarım yönü, tarihsel sınırlar |
| `RAPOR_DURUM_INDEKSI.md` | Tıklanabilir gerçek yerel dosya yolları | — | Her raporun belge durumu; tarihsel bilinmeyenler açıkça ayrıdır |
| `TUM_RAPOR_DOSYA_YOLLARI.txt` | Tek dosyada bütün rapor/ek yolları | — | 1.087mutlak dosya yolu ve durum etiketi |
| `RAPOR_KATALOGU.json` | Makine okunur envanter | — | Başlık, yol, son belge durumu, Git izlenme ve odak paket bilgisi |
| `PAKET_DOGRULAMA.json` | Yerel ZIP kimliği/kanıt | — | SHA256, sayı ve CRC/entryhash doğrulaması |

ZIP'ler bu klasörde **yereldir**, GitHub'a ikili arşiv olarak push edilmedi. Kaynak raporlar zaten repo/yerel dosyalarda; bu kayıt ve doğrulama metadata'sı Git'e alınır. 98Git'te izlenmeyen/ignore edilmiş yerel eski rapor da tam ZIP'tedir; bunların gövdeleri ayrı ayrı Git'e eklenmedi.

ZIP'i çıkardıktan sonra önce `00_ONCE_BUNU_OKU.md` oku. İç ZIP yolları özgün klasör yapısını korur. Odak ZIP'in kataloğu yalnız kendi88raporunu; tam arşivin kataloğu1.087rapor/ek dosyasını listeler. Dış klasördeki indeks gerçek çalışma kopyasına mutlak bağlantı verir. Ürün `src/backend` dosyaları veya bütün tarihsel resimler ZIP'te bulunmayabilir; bunlar için çalışma kopyası/pinned GitHub bağlantısı kullanılır.

## Açık ile tarihseli ayırma

- R830,R831,R833,R835,R837,R840: son kayıtları yalnız denetim/rapor; odak okuma sırasındadır. Bu paketle buglar tekrar üretilmedi; bugünkü kodda açık olduğuna dair yeni test sertifikası değildir.
- R815'in134bulgusu topluca açık değildir: remediation133düzeltilmiş/1azaltılmış-açık **B63** der; **B98** R830'da yeniden açılmıştır. İlgili status/README pakettedir.
- R817,R818–R823,R824/R825 için sonraki onarım/implementation kayıtları vardır. R826–R829,R832,R836 ürün uygulama raporlarıdır. Eski hiçbir düzeltme yapılmadı cümlesi güncel açık durum sayılmadı.
- R834 kısmi uygulama ve daha sonraki tasarımla tekrar eşleştirilmelidir. R836T16/T20yorum yüzeyi; son1944devir gezinme/asistan/film/browser/player yüzeylerini değiştirdi.20eski tasarım maddesi otomatik açık sayılmaz.
- R838/R839/R841/R842 araştırma olarak teslim edildi; karttaki zatenvar davranışlar ve son1944tasarımıyla örtüşenUIönerileri ayrılmalı. Yeni GitHub/RSS/medya mekanizmalarının ayrıntıları araştırma ekleriyle birlikte verildi.
- Diğer tarihsel raporlar **durumu teyitsiz** etiketlidir.1.087belge1.087açık bug değildir. Eski bulguları veya rapor toplamlarını toplayıp yeni bug sayısı üretme.

Paketleme sırasında ana kopya bağımsız tasarım teslimiyle `39bf5bd4` → **`c0786bfab10cbdc49dc023c3ef0a95838c75163b`** oldu. Yeni AGENTS/DESIGN,1944devir ve tasarım bağlamı pakete eklendi. Üst medya menüsü/grafit-amber/sinematik hiyerarşi önceliği eski genel sol gezinme önerilerinden üstündür. Son tasarım teslimi yabancı bug raporlarını yeni görev yapmadığını açıkça belirtir.

## Bütünlük ve kapsam

Her iki ZIP açıldı, `testzip()` CRC kontrolü ve her kaynak girdisinin SHA256 eşleşmesi geçti; yinelenen entry adı yok. Kaynak dosyalar tek snapshot'tan alındı; paketleme sonunda HEAD ve bütün giriş dosyalarının hâlâ aynı olduğu kontrol edildi. [Doğrulama metadata'sı](aktarim-2026-11-01/verification.json).

- Odak ZIP SHA256: `722ca1c0b15f8e3b65e69ccbe55746e36736750b45d0fe9f1aef7422fae3191f`
- Tam ZIP SHA256: `cc3126c64d8055efa08cb551f59bc2ebdea3034731d3b2ec2024f4ca96beeac9`

Tam arşivde eski bir SOAK JSON'undaki7olası anahtar biçimi arşiv kopyasında maskelendi; manifest hangi dosyada olduğunu ve maskelenmiş byte hash'ini taşır. Bunların gerçek anahtar mı sentetik test dizgesi mi olduğu iddia edilmez. Özgün dosyalar değiştirilmedi. Odak pakette maskeleme0. Gerçek profil/ayar,git,node_modules,venv,ham.log,medya ve mevcutZIP içeriği alınmadı. Kamuya ait seçilmiş güncel görseller/kanıt betikleri var; betikler çalıştırılmadı.

Ürün testi, bug tekrar üretimi, yeni uygulama veya GitHub CI sonucu kabulü yapılmadı. Yalnız dosya/kapsam/CRC/hash/indeks kontrolleri yapıldı. ZIP'lerin üretilmesi rapor önerilerini uygulama izni veya bütün tarihsel açık durumlarının doğrulanması değildir.
