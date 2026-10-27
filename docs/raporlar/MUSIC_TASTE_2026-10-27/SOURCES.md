# Kaynak incelemesi — çoklu referans ve geri bildirim

27 Ekim 2026. Mevcut R659–R664 müzik kodu ve devir notları incelendi. Önceki araştırma ve motor tekrar kurulmadı.

- [benfred/implicit — nearest_neighbours.py](https://github.com/benfred/implicit/blob/main/implicit/nearest_neighbours.py): gerçek kaynakta normalize cosine, `filter_items` ile kimlik tabanlı çıkarma ve aday ID sınırları okundu. [MIT lisansı](https://github.com/benfred/implicit/blob/main/LICENSE) doğrulandı. Exact-ID filtreleme yaklaşımı bizim sağlayıcı/yerel kimliklerimize bağımsız uygulandı. SciPy/Cython bağımlılıkları, collaborative model veya kod kopyası alınmadı; çok kullanıcılı dinleme verimiz yok.
- [LAION CLAP hook.py](https://github.com/LAION-AI/CLAP/blob/main/src/laion_clap/hook.py): resmî audio embedding arayüzü incelendi. Mevcut sabitlenmiş `laion/clap-htsat-unfused` motoru korundu; model uzayları birleştirilmedi. Eşit ağırlıklı referans ortalaması bizim ürün kararıdır; modelin desteklediği duygu/enstrüman kontrolü gibi sunulmadı.
- [CLAP model kartı](https://huggingface.co/laion/clap-htsat-unfused): mevcut Apache-2.0 checkpoint ve R661 sabit revizyonu kullanıldı. Yeni model/bağımlılık/kurulum yok.

Kullanıcının beğenmediği parça, yalnız sağlayıcı + kesin parça kimliğiyle gizlenir. Bu, yeni bir kişisel beğeni modeli eğitmek veya o parçaya benzeyen her sesi reddetmek değildir. Kullanıcı verisi bu inceleme için dışarı gönderilmedi.
