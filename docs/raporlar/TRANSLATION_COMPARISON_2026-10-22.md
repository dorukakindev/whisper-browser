# NBW Sonnet ve Shuai Sol canlı çeviri karşılaştırması

Tarih: 2026-10-22. Ürün tabanı: `31db4dc46f1ac62ef920d26eb625fef30852c199`. Kullanıcının verdiği anahtarlarla sınırlı test yetkisi. Anahtarlar dosyaya/rapora/Git'e yazılmadı. Sentetik kaynaklar kullanıldı; kişisel SRT gönderilmedi.

## Yöntem

10 kaynak grubu / 12 cue, İngilizceden Türkçeye. Aynı `build_translate_prompt(...for_speech=True)` ve ardından `build_refine_prompt(...for_speech=True)`, temperature 0.2, max_tokens 6000, streaming kapalı. Her modelde tek çeviri ve tek kaynakla gözden geçirme isteği; ek tekrar yok. Karşılaştırma doğrudan prompt/API ve yanıt kabul yardımcılarıyla yapıldı, tam llm_translate kurtarma/önbellek/arayüz koşumu değildir. Komşu paket taslakları ve seri hafızası bu tek paket denemesinde yok.

NBW us/yt iki adresinin /v1/models yanıtları claude-sonnet-5-5 kimliğini listeledi. Çeviri yalnız us rotasında yapıldı. Shuai listesi gpt-6.1-sol kimliğini doğruladı. Kimlikler gateway beyanıdır; gerçek upstream model kimliği/sağlayıcı özgünlüğü bağımsız doğrulanmadı.

## Ölçüm

| Rota / istenen model | İlk geçiş | İkinci geçiş | Toplam | İlk biçim | İkinci biçim |
|---|---:|---:|---:|---|---|
| https://us.nbwcode.top/v1 / `claude-sonnet-5-5` | 13.03 sn | 9.44 sn | 22.47 sn | 10/10 grup geçerli | ID dışı 12 eklendi; bütün review paketi reddedilir |
| https://api.shuaiapi.com/v1 / `gpt-6.1-sol` | 28.36 sn | 12.45 sn | 40.81 sn | 10/10 grup geçerli | 12 ID / 10 grup korundu |

Süreler tek deneme ve bu anki rota yüküne bağlıdır; genellenebilir performans benchmarkı değildir. İstekler iki sağlayıcıya paralel gönderildi; her sağlayıcının ikinci geçişi kendi ilk yanıtını aldı. Token sayaçları gateway bildirimi olup fiyat/fatura doğrulaması yapılmadı.

## Değerlendirme

- Bu küçük örnekte **Shuai gpt-6.1-sol tercih edilir**: özellikle doğal Türkçe söz dizimi ve ikinci geçiş ID disiplini daha iyi. NBW Sonnet de çoğu anlamı doğru taşıdı; daha hızlıydı. Kalite farkı büyük veya her konuda kesin diye sunulmaz.
- İki model de biliş bağlamındaki bicameral ile parlamento anlamını ayırdı. Sol iki bölmeli zihin, Sonnet bikameral zihin dedi. İkisi de bu bağlamda iki meclisli zihin yanlışına düşmedi.
- Doz azaltımı, olumsuzluk, zorunluluk/yasak ayrımı, nedensellik belirsizliği ve ironik gecikme örnekleri elle karşılaştırıldığında belirgin anlam kaybı göstermedi.
- Sonnet review yanıtında iki cümleli 8 numaralı cue iki ID'ye bölündü, sonraki items kaydı. reply_id_range_issue => kimlik_araligi_disinda. Böyle bir yanıt için mevcut uygulama güvenle ilk çeviriyi korur; bozuk review metni başarı sayılmadı.
- İki modelin 6. gruptaki doğru alıntı çevirileri part_anchor_issue => ozel_ad_kaydi:0 üretti. Bu model başarısızlığına dahil edilmedi; ürünün kalite kapısında olası yanlış pozitif ayrı takip gerektirir. Bu çalışma ürün kodunu değiştirmez.
- 10 örnekte tek koşum insan çeviri değerlendirmesidir; kör hakem, bağımsız referans corpus, uzun video, TTS/dinleme, canlı YouTube ve gerçek uygulama uçtan uca testi değildir. Sonuçlardan kusursuzluk veya yüzde başarı puanı çıkarılmaz.

## Kaynak ve ilk geçiş çıktıları

### Grup 1

Kaynak: I don't think that he will survive this heavy attack.

NBW: Bu ağır saldırıdan kurtulacağını sanmıyorum.

Shuai: Onun bu ağır saldırıdan sağ çıkacağını sanmıyorum.

### Grup 2

Kaynak: In Julian Jaynes's theory, the bicameral mind is a model of cognition, not a legislature with two chambers.

NBW: Julian Jaynes'in teorisinde bikameral zihin bir biliş modeli olup iki meclisli bir yasama organı değildir.

Shuai: Julian Jaynes'in kuramında iki bölmeli zihin, iki meclisli bir yasama organı değil, bir biliş modelidir.

### Grup 3

Kaynak: They could no longer exercise their own will, even though they were still able to follow instructions.

NBW: Artık kendi iradelerini kullanamıyorlardı, yine de talimatları takip edebiliyorlardı.

Shuai: Hâlâ talimatlara uyabiliyor olsalar da artık kendi iradelerini kullanamıyorlardı.

### Grup 4

Kaynak: The dose was reduced from 20 mg to 5 mg; it was not increased by 5 mg.

NBW: Doz 20 mg'dan 5 mg'a düşürüldü; 5 mg artırılmadı.

Shuai: Doz 20 mg'dan 5 mg'a düşürüldü; 5 mg artırılmadı.

### Grup 5

Kaynak: The evidence may suggest a connection, but it does not establish that one event caused the other.

NBW: Kanıtlar bir bağlantıya işaret edebilir ama bir olayın diğerine neden olduğunu kanıtlamaz.

Shuai: Kanıtlar bir bağlantıya işaret ediyor olabilir, ancak bir olayın diğerine neden olduğunu ortaya koymaz.

### Grup 6

Kaynak: She said, "You must not leave," but he heard, "You do not have to stay."

NBW: Kadın "Ayrılmamalısın" dedi ama adam "Kalmak zorunda değilsin" diye duydu.

Shuai: Kadın, “Gitmemelisin,” dedi ama adam bunu “Kalmak zorunda değilsin,” diye duydu.

### Grup 7

Kaynak: Great, another delay. That's exactly what we needed.

NBW: Harika, bir gecikme daha. Tam da ihtiyacımız olan şeydi.

Shuai: Harika, yine bir gecikme. Tam da ihtiyacımız olan şey buydu.

### Grup 8

Kaynak: The power supply delivers 12.5 watts, whereas political power cannot be measured in watts.

NBW: Güç kaynağı 12,5 watt sağlar, oysa siyasi güç watt cinsinden ölçülemez.

Shuai: Güç kaynağı 12,5 watt güç sağlar, oysa siyasi güç watt cinsinden ölçülemez.

### Grup 9

Kaynak: By 'bicameral', Jaynes means a division of mental functions; he is not referring to a two-chamber parliament.

NBW: Jaynes 'bikameral' derken zihinsel işlevlerin bölünmesini kasteder; iki meclisli bir parlamentodan bahsetmiyor.

Shuai: Jaynes, “iki bölmeli” derken zihinsel işlevlerin bölünmesini kastediyor; iki meclisli bir parlamentodan söz etmiyor.

### Grup 10

Kaynak: Only after the experiment had ended did we realize that the apparent improvement had been caused by a measurement error.

NBW: Ancak deney bittikten sonra görünürdeki iyileşmenin bir ölçüm hatasından kaynaklandığını fark ettik.

Shuai: Görünürdeki iyileşmenin bir ölçüm hatasından kaynaklandığını ancak deney sona erdikten sonra fark ettik.
