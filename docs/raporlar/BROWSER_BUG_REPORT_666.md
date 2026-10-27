# Rapor 666 — Deneysel ses etiketleri: birinci aşamanın ilk paketi

Başlangıç master `295d69b4173fa5fc2fba1eddc46bb5df2e6a7bb4`; dal `codex/music-tags666`; bitiş ürün commit `23ce2a9caf61ab0bace1fcdf67d35666bb459181`.

## Kullanım

Müzik → Analiz et → CLAP hazırla (henüz yoksa) → **Etiket kaynaklarını hazırla · 2 MB** → kaynak/aralık seç → **Ses etiketlerini keşfet**. Mevcut modelin metin ağırlıkları kullanılır; yeni büyük model indirilmez. 12 tür, 8 atmosfer, 12 enstrüman ve 2 vokal açıklaması sabit aday kümesidir. Her kategoride ortalaması en yüksek üç aday ve kesit puanları gösterilir; hücre tıklaması o saniyeye gider. Uzun kaynaklarda mevcut motorun en fazla altı10saniyelik örneklemesi kullanılır; boşluklarda tahmin eğrisi uydurulmaz.

Bunlar **deneysel zero-shot ses–metin cosine benzerlikleri**; kalibre olasılık veya kesin müzik sınıflandırması değildir. Atmosfer tahmini insanın hissettiği duygu değildir. Aynı şekilde bir enstrüman adayı, o enstrümanın varlığının ispatı değildir. İlk iki ortalama arasındaki fark0.03altındaysa ayrım zayıf bilgisi gösterilir; bu yalnız UI yakınlık kuralıdır, istatistiksel güven aralığı değildir. Mood/enstrüman uzman modelleri ve insan kalite kıyası yapılmadan birinci aşama bütünü tamamlandı sayılmaz.

## Kaynak ve model

- [Resmî CLAP model kartı](https://huggingface.co/laion/clap-htsat-unfused) zero-shot audio sınıflandırma ve audio/text özelliklerini açıklar. Apache-2.0 checkpoint korunur; revizyon `8fa0f1c6d0433df6e97c127f64b2a1d6c0dcda8a`. [LAION hook.py](https://github.com/LAION-AI/CLAP/blob/main/src/laion_clap/hook.py) gerçek tokenizer/embedding arayüzü okundu. Kod kopyalanmadı.
- [Essentia modelleri](https://essentia.upf.edu/models.html) ve [lisans](https://essentia.upf.edu/licensing_information.html) incelendi: uzman müzik modelleri mevcut fakat model lisansları CC-BY-NC-SA ve runtime uyumluluğu ayrıca değerlendirilmelidir. Bu pakette Essentia kurulmadı; model lisansı sessizce Apache sayılmadı.

Aynı revizyondan indirilen tokenizer varlıkları sabit boyut ve SHA256 ile doğrulanır, atomik değiştirilir:

| Dosya | Byte | SHA256 |
|---|---:|---|
| tokenizer.json |2108746|77ef92283d67f0d97e1454909a964afcbfa2019f0fb9f18f8e88d5c25c3ba729|
| tokenizer_config.json |384|377f91458f7729a4574a84c77bdce67dbc3c58c1a345a29bbf8c4eb1307948a3|
| special_tokens_map.json |280|06e405a36dfe4b9604f484f6a1e619af1a7f7d09e34a8555eb0b77b66318067f|

İndirme yalnız açık hazırlama eyleminde; üretim `local_files_only=True/weights_only=True`. Paket kurulumu yok, mevcut Transformers/Torch ortamı korunur. Hazırlama burada gerçekten yapıldı; dosyalar ignore edilen backend/models/music-clap altında, Git'e alınmadı. Ses dışarı gönderilmez.

## Kod ve kanıt

backend/music_tags.py: pinli varlık hazırlama, sabit açıklamalar, gerçek text/audio embedding ve segment skorları. music_similarity.py: iç worker özelliğiyle mevcut referans vektörlerini yeniden kullanma. music-similarity.js/service: mevcut global iş kilidi, tags/prepare-tags kipleri, kesin dosya kimliği ve iptal süreci. Renderer UI/CSS: dört kategori, açık belirsizlik, zaman hücreleri, dark/amber ve dar ekran. Assistant registry/actions: kaynak bağlı analyze_tags; gerçek sonuçlar soundTags bağlamında, dosya yolları hariç. Yeni IPC kanalı/veri şeması yok. start/install dosyaları değişmedi.

12 hedefli Node kontrolü ve 9 Python kontrolü PASS. Python score testleri identity/orthogonal/opposite cosine değerlerini1/0/-1olarak doğrular; sıfır/NaN/yanlış boyut reddi. JS syntax, Python py_compile ve diff PASS. Gerçek Windows native `.uiprev/music666/1793133061370` PASS: üç gerçek kesitte dört kategori, finite skorlar, kesite tıklama/oynatma ve dar/geniş taşma kontrolü. Görüntüler incelendi; [temiz sonuçJSON](MUSIC_TAGS_2026-10-27/native-result.json). İlk trompet fixture denemesinde instrument top1 trumpet0.6625/saxophone0.41477; genre top1 jazz0.49901. Bu küçük pozitif kontrol geniş müzik kalitesi kanıtı değildir. Duygu adaylarının yakın olması açık belirsizlik tasarımını destekler.

## Sınırlar

Etiketler sabit prompt ifadelerine ve aday listesine duyarlıdır; Türkçe etiket gösterimi modelin İngilizce promptlarını değiştirmez. Ayrı duygu/enstrüman uzman modeli veya tam parça sürekli zaman analizi yapılmadı. İnsan kör dinleme kıyası, canlı LLM tool seçimi, üretim start.bat açılışı, temiz install, GPU/DRM ve uzun soak bu turda yapılmadı. CPU testleri kullanıldı; CI açık kalır, beklenmedi. Önceki11 before-quit listener uyarısı sürer. Yeni özellik mevcut Whisper/VoxCPM2 hattını değiştirmez. Sonraki adım bu deneysel hattı uzman modeller/örnek setiyle karşılaştırıp kalite kapısını belirlemektir.
