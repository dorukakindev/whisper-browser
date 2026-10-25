# Rapor577 — Gerçek dublaj kabulüne hazırlık ve GPU engeli

25 Ekim2026 16:26, dal `codex/book-reliability549`, PR487. Başlangıç `4f03d47f245eaa4df38cc048ad80cca035c1c845`; araç bitiş `09a26bdc5a749da6393416bc47dd0962e1a3c247`. Yeni ürün hatası sayısı **0**; bu çalışma gerçek kabulün güvenli yürütülmesi içindir, P10 tamamlanmadı.

## Gerçek ortam kanıtı

Windows `nvidia-smi`: RTX4070SUPER, toplam12282MiB; 16:21'de5256MiB kullanım/%28 GPU. Sonraki ölçümlerde boş bellek5419–5476MiB, kullanım değişken. Ayrı Python eğitim işi saf `C` compute süreci olarak çalışıyor. Kişisel süreç sonlandırılmadı; yanına TTS modeli yüklenmedi. Bu bellek ölçümü mevcut motorun5,5GiB asgari kontrolünün bile altına inebiliyor. Üretim/kalite sonucunu mock veya CPU sesiyle tamamlanmış saymak doğru değil.

## Araç

- `tools/voxcpm2/accept_dub.py`: varsayılan salt hazırlık kontrolü; model/GPU üretimi yalnız açık `--run` ve mevcut motor/izinli referans/döküm/backend Python yollarıyla. İlk GPU'da en az8GiB boş bellek, saf compute işi yok ve bilinen süreç envanteri gerekli. WDDM masaüstü `C+G` listeleri ayrılır. GPU rezervasyonu değildir; eşzamanlı yeni iş başlayabilir.
- İki sabit Türkçe blok: sayı/olumsuzluk/soru/cümle devamı. Mevcut nano-vLLM/VoxCPM2 hattı;15adım/CFG1,65/temperature0,8/seed42/iki paralel grup/ayrıntılı CPU ASR/video zamanlaması. Model indirmesi kapalı. Kişisel motor cache'leri yerine her seferinde yeni ignored `tmp/real-dub-accept-*` alanı; kişisel referans değiştirilmez.
- Üretim sonrası gerçek WAV süresi/örnek sayısı, aşama süreleri, iki grubun ASR ve review durumları kaydedilir. Çıktı `produced_needs_listening`; ASR geçmesi duygu/doğal ton garantisi değildir. Eksik doğrulayıcı/review başarı sayılmaz. Gerçek üretim yolu bu turda **çalıştırılmadı**.
- `tests/test_dub_acceptance.py`: compute işi/düşük bellek/bilinmeyen veya eksik envanter kapıları; meşgul `--run` dosya oluşturmadan/import etmeden döner. Normal pakette model başlatmaz.
- `tools/voxcpm2/README.md`: değişkenlerle kişisel yol içermeyen manuel kullanım ve sınırlar.

## Kontroller ve devam

2 hedefli unittest PASS; py_compile/diff temiz. Gerçek `--run` çağrısı `blocked_gpu`,5476MiB boş,1 compute işi, exit2: güvenlik kapısı çalıştı, ses üretilmedi. Bu sonuç gerçek TTS başarısı veya üretim yolunun uçtan uca testi değildir. UI değişikliği yok; önceki P09 gerçek Windows görüntüleri Rapor576'da. Yeni bağımlılık/kurulum/kalıcı şema yok. Fullsuite/CI/canlı sağlayıcı/kişisel start.bat bu turda koşulmadı; eski ratchet zamanlama başarısızlığı başarıya çevrilmedi.

P01–P09 kanıtları PRODUCT_FOCUS listesinde568–576 raporlarıyla kayıtlı; burada yeniden tamamlanmış sayılmadı. P10 için GPU'daki kişisel eğitim bittikten sonra hazırlık kontrolünü tekrar çalıştır. Motorun venv Python'uyla README komutunu kullan; yerel izinli referans ve birebir döküm. Üretilen iki gerçek bloğu dinle, ASR kanıtını incele, aşama sürelerini kaydet. Doğal ton/eksik okuma hakkında kanıt oluşmadan hedefi kapatma. Son kabul/PR incelemesi ve kullanıcı ana sürüme alma onayı bekler; otomatik master merge yapılmaz.
