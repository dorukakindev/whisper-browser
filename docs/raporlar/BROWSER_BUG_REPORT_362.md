# BROWSER_BUG_REPORT_362 — Kuyruk-50 Madde 50: Sürüm kabul kampanyası

Tarih: 2026-10-01 · Dal: `devin/1790895141-k50-release-acceptance` · Başlangıç HEAD: `ca112e0` · Bitiş kod: `2347256`

## Kapsam

50'lik kuyruğun son maddesi: "Sürüm kabul kampanyası (lisanslı uzun medya + zor altyazı korpusuyla transkripsiyon→çeviri→düzenleme→kayıt→yeniden açma; kalite/süre/kaynak karşılaştırma + devir + kalan sınırlar)".

Yeni harness `tools/release-acceptance.js` tek koşuda dört aşamayı yürütür ve `acceptance.json` + `RELEASE_ACCEPTANCE.md` üretir (`--keep-tmp` ile ara çıktılar korunur).

## Kampanya yapısı

- **Korpus üretimi:** 10 çeşitli İngilizce cümle × 5 tur + segment marker'ları → gTTS ≈5.25 dk konuşma (2.5 MB mp3, lisans güvenli sentetik medya). Referans metin kalite ölçümü için kaydedilir.
- **A — transkripsiyon:** tiny/CPU, `/usr/bin/time -v` altında: duvar süresi + tepe RSS, SRT/VTT/JSON cue sayıları, BOM denetimi (SRT zorunlu `utf-8-sig`, VTT spec gereği **BOM'suz** — aksi ihlal), monoton zaman, referansla kelime örtüşmesi.
- **B — çeviri:** gerçek `translate_existing_subtitle` hattı (`--translate-only true`), süreç-içi stub OpenAI sağlayıcısıyla. Stub, backend'in `sentence_groups` payload sözleşmesine uyar: `items` `[{i,max,t}]` listesi, `ids` pozisyonları; yanıt `{sentences:{ilk_id:bütün}, items:{pozisyon:parça}, memory:{}}`. Parça metinleri çapa tokenlarını korur (sayı/para/birim/tarih/ay-adı/SDH/özel ad — kesme ve tire içeren biçimler dahil) + olumsuzluk/modal işaretçileri; echo/anlam/özel-ad kapılarını geçen, kanıtlanabilir biçim.
- **C — düzenle/kaydet/yeniden aç:** 3 cue deterministik düzenlenir, dosya yazılır, yeniden açılır; düzenlerin kalıcılığı, dokunulmayan cue'ların birebirliği ve zamanların korunması doğrulanır.
- **D — zor korpus matrisi:** 8 fixture (sdh, numbers, cjk-rtl, longlines, entities, overlaps, edge-times, empty) ayrı ayrı translate-only koşusu; satır başına ref/çıktı cue, tr kapsama, zamanlama bütünlüğü, çökme/beklenen-düşme (empty'de `drop_empty_entries` tasarımı) kaydı.

## Sonuç (22:50 UTC koşusu, korpusHash 831c87b6a14b)

| Aşama | Ölçüm | Sonuç |
|---|---|---|
| transcribe | 7.2 sn duvar, 955 MiB tepe | 63 cue ×3 format; BOM doğru; monoton; referans kelime örtüşmesi 0.838 |
| translate | 2.0 sn, 677 MiB, 6 sağlayıcı isteği | **final** `long-speech.tr.srt` (kısmi→tam yol), 58/63 (%92), zamanlama korundu |
| edit-save-reopen | — | 3 düzen kalıcı, geri kalan birebir, zamanlar korundu |
| korpus matrisi | 8 dosya | 8/8 yeşil |

- **Doğrulanmış ürün kusuru: yok.** Kampanya kapı davranışını belgeliyor: stub'a açılan retler (`part_kapisi_ozel_ad_bozulma`, `part_kapisi_ozel_ad_kaydi`, `kaynak_yankisi`, `anlam_*`) sözleşmenin çalıştığını; küçük-paket kurtarma ve kısmi→tam dosya yolunun devreye girdiğini gösterdi.
- Kalan 5 çevrilmemiş cue aynı "façade/pounds" örüntüsünün tekrarları — tek başına geçen, toplu gruplamada sahte-Türkçe stub'ın çapa eşleşemediği satırlar (stub artefaktı, ürün kusuru değil; gerçek sağlayıcı Türkçe üretir).
- "Özel ad tutarsızlığı" uyarıları + `eksikleri tamamla` önerisi backend'den doğru biçimde çıktı.

## Bulunan/düzeltilen (harness tarafı)

1. `spawnSync` + süreç-içi stub HTTP = event-loop deadloğu (backend istekleri cevapsız) → `runBackend` async `spawn`. Kayıt: araç içi yorumda.
2. `--translate-only` argümanı literal `true` bekliyor (`type=lambda x: x.lower()=="true"`).
3. VTT BOM beklentisi tersindi — spec BOM yasaklar; `vttBom=false` doğru.
4. Stub yanıtı sözleşme kapılarına uyarlandı (yukarıdaki çapa kapsamı).

## Kalan sınırlar (Windows devrinde)

- Gerçek lisanslı uzun medya (≥1 saat) `D:\Whisper Local` altında koşulmadı — sentetik ~5 dk gTTS kullanıldı.
- GPU/CUDA yolu (RTX 4070 Ti) bu kutuda yok; tiny/CPU ölçüldü — GPU hız/bellek karşılaştırması bekliyor.
- Ücretli LLM sağlayıcı + gerçek WER karşılaştırması yok (stub yalnız sözleşme/akış doğrular).
- Kuyruk/UI üzerinden yeniden-açma (sonuç modalı, kuyruk devamı) ayrı Electron acceptance kapsamında.
