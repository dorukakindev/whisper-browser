# BROWSER_BUG_REPORT_179 — R220/R221: çeviri hattı derin düzeltme paketi (backend)

Tarih: 2026-09-28 · Dal: `codex/r221-translate-pipeline-1790900000` ·
Kapsam: kullanıcının sahte-API harness'ı (`ceviri-denetimi.zip`) ile doğruladığı
12 doğrulanmış/okunan bulgu + 4 not — backend (`backend/`) tarafı. Electron
tarafı PR #<bir-sonraki>'de.

Doğrulama donanımı: kullanıcının `mockapi.py` fixture sunucusu (port 8810) +
`gate_corpus.py`, `e2e_protocol.py`, `e2e_gates.py`, `e2e_resume.py`,
`e2e_cache.py`, `hang_test.py` betikleri; baseline ölçüm `/tmp/wb-base-baseline`
(master `bbd36dd`) üzerinde alındı.

## Doğrulanmış bug'lar ve düzeltmeler

### 1. Yankı reddedilen satırlar işi öldürüyordu → "değişmeden kabul" + atla

**Bulgu:** `translation_is_source_echo` modele aynen döndürülen satırı
reddediyordu; oysa kimi satırlar zaten değişmeden kalmalı ("Ha ha ha.",
"Hasta la vista, baby.", kaynak içinde zaten Türkçe olan satırlar,
"iPhone 15 Pro." kod dizgileri). 7 satırlık dosyada her biri 3'er istek
yaktı; iş exit 1 ile bitiyordu ve `.tr.srt` hiç yazılmıyordu.

**Düzeltme:**
- `line_keeps_source()` — çevrilmeden korunacak satırları API'ye hiç
  göndermez: vokalizasyonlar, yalnız sayı/sembol, ad/kod dizgileri,
  zaten hedef dilde olan satırlar (`_line_looks_turkish`).
- Kurtarma zincirinde (`retry_groups_once`/`rescue_group`) echo gören
  gruplar `echo_seen>=2` sonrası "değişmeden kabul edildi" diye işaretlenip
  önbelleğe yazılır — artık sonsuz ret döngüsü yok.
- `parse_llm_json_object` artık `<think>…</think>` bloğunu önce siler
  (`strip_reasoning_think_blocks`) — DeepSeek-R1/Qwen3'ün düşünme bloğu
  içindeki `{…}` nesnesi artık gerçek yanıt yerine seçilmiyor.

**Yan etki düzeltmesi (bulgu sınıfı):** daraltılan `line_keeps_source`
başta `♪…♪` satırları ve tek-büyük-harfli diyakritik adları ("Mrs. Aydın")
da korunmaya alıyordu; golden corpus bunları yakaladı — `♪` satırlar
tekrar çevrilebilir (Altın Korpus `'♪ Fire on the mountain ♪' →
'♪ Dağda yangın ♪'` kilidi), `_line_looks_turkish` artık tek büyük-harfli
diyakritik isimleri saymaz (≥2 diyakritik kelime veya küçük-harfli tek
diyakritik ister). Türkçe harf içermeyen `[A-Za-zÀ-ÿ]+` kelime deseni
`[^\W\d_]+` olarak düzeltildi.

**Kanıt:** `gate_corpus.py` 22/81 → 1/81 ret (tek kalan: 'Rock and roll!'
echo — kasıtlı). Golden corpus 6/6. Birim: `test_translate_pipeline_r220.py`
23 test.

### 2. `translate_existing_subtitle` aynı-dil kapısı yoktu

**Bulgu:** Türkçe `.tr.srt`'yi Türkçeye "çevirmek" ~3000 istek yakardı
(normal transkripsiyon yolunda kapı `6391`'de vardı, bu yolda yoktu).

**Düzeltme:** `translate_existing_subtitle` başında `source==target`
kapısı + kaynak `auto` iken `file_looks_turkish()` çoğunluk sinyali;
eşleşmede iş `done` durumuyla sıfır istekte biter.

### 3. İç içe retry'lar (6 HTTP/paket, ~9 dk rota başına)

**Bulgu:** çeviri istemcisi `OpenAI(timeout=180)` + SDK varsayılan
`max_retries=2` + üstte `call_api_with_retry(attempts=3)` → 6 istek/paket;
asılı uçta ~18 dk (hesaplanan) / ölçülen ~9 dk rota başına.

**Düzeltme:** çeviri istemcisine `max_retries=0` (chat yoluyla aynı);
`call_api_with_retry` 3 denemesi gerçek ağ/time-out sınıfına indirildi;
`TranslationTruncatedError` ve `route_error_is_definitive` rotaları
kesin sınıflandırıldı.

### 4. GPT-5/o-serisi `temperature` 400'ü

**Bulgu (kod okuma):** dosya çevirisi her istekte `temperature=0.2` +
`system` rolü gönderiyordu; reasoning modeller bunu 400 ile reddeder.
`is_reasoning_chat_model` sohbet yolunda vardı, dosya yolunda yoktu.

**Düzeltme:** `llm_generation_kwargs` — reasoning ailesine `temperature`
yerine `max_completion_tokens=8192`; `chat_instruction_role` `system`→
`developer`. 400 hatası `route_error_is_definitive` ile fatal-fast.

### 5. `finish_reason=="length"` yanıtı paket küçültmüyordu

**Düzeltme:** kesik yanıt `TranslationTruncatedError` fırlatır; `task`
paketi ikiye böler (özyinelemeli). `parse_llm_json_object` kurtarılabilir
kısmi JSON'u zaten topluyordu — e2e `truncate(ilk-1)` artık 57/57.

### 6. Artımlı kalıcılık: iptal/çökmede ödenen çeviriler kayboluyordu

**Bulgu (doğrulandı):** önbellek yalnız iş sonunda yazılıyordu; ortada
iptalde 200 satırın 200'ü tekrar API'ye gidiyordu.

**Düzeltme:** `stage_group_cache`/`stage_tm_rows`/`flush_cache_and_tm`
— her kabul edilen paket sonrası (ve ~5sn'de bir) önbellek + TM +
`.partial.srt` yazılır; `cancellation_checkpoint` paket aralarına kondu;
pool `finally` bloğu `rescue_pool.shutdown()` + zorla-flush +
`close_translation_memory()` ile temiz kapanış sağlar.

### 7. "Eksikleri tamamla" yanlış bağlam kuruyordu

**Bulgu (doğrulandı):** yalnız eksik satırlar ayrı liste olarak modele
gidiyordu — "I think" / "are right." tek cümle sanılıp birleştiriliyordu.

**Düzeltme:** `llm_translate(precompleted=)` — tüm satırlar bağlam olarak
gönderilir; yalnız eksikler grup halinde istenir; tamamlanmış satırlar
context_before/after olarak kalır ve dokunulmaz.

### 8. Definitive-hata fırtınası + yapısal devre kesici

**Düzeltme:** `route_error_is_definitive` (400 + content_filter/
moderation/policy) rotalarda fail-fast; `MAX_STRUCTURAL_FAILURES=6`
ardışık geçersiz-yanıt devresi (`translation_metrics["invalid_batches"]`)
son-deneme turlarını keser. Golden corpus sözleşmesi güncellendi:
`golden + blocked ≤ çağrı ≤ golden + blocked + 6`.

### 9. series_memory paket başına fsync → iş sonunda tek yazım

**Düzeltme:** `merge_many()` — paylaşılan kilidin içindeki paket-başı
disk yazımı kaldırıldı; bellekte toplanan adaylar iş sonunda tek `_save`
ile yazılır ve **final metinlere karşı yeniden süzülür** (2. geçişte
değişen terimler eski karşılıkla kirlenmez).

### 10. Refine geçişinde 1. geçiş grupları önbelleğe yazılmıyordu

**Düzeltme:** doğrulanamayan grup 1. geçiş çevirisiyle önbelleğe yazılır;
yeniden koşu ücretsiz.

### 11. PDF önbellek anahtarı endpoint'sizdi

**Düzeltme:** `pdf-translate.js` kimliğine `endpoint` eklendi (Electron
PR'ında; aynı model adı farklı sağlayıcıda önbellek karışmaz).

### 12. Almanca kaynakta otomatik-terim çıkarımı gürültülü

**Düzeltme:** `extract_auto_glossary(source_lang=)` — de/gsw/lb/yi
dillerinde büyük-harf sinyali terim tespitinden çıkarıldı (hepsi büyük
yazılır; kurallar anlamsız dolar).

## Harness sonuçları (baseline → bu dal)

`e2e_protocol.py` (57 cue, proto.en.srt):

| senaryo | önce | sonra |
|---|---|---|
| think (hep) | 122 istek, 0/57, exit1 | **3 istek, 57/57** |
| one_indexed | 122 istek, 0/57 | **3 istek, 57/57** |
| items_list | 122 istek, 0/57 | **3 istek, 57/57** |
| content_filter | 122 istek | **3 istek, exit1** |
| empty / invalid_json | 122 istek | **17-18 istek, exit1** |
| truncate (ilk 1) | 15 istek, 39/57 | **6 istek, 57/57** |
| 503 (ilk 3) | 5 istek, 5/57 | 5 istek, **37/57** kısmi |
| 429 RA=3 | 5 istek | 5 istek, 57/57 |
| context_leak | SIZINTI=1 KAYMA=1 | aynı (bilinen sınır) |

`e2e_cache.py`: 1. koşu 3 istek, aynı dosya 2. koşu **0**, aynı içerik
farklı ad/farklı worker/biçim **0** — önbellek anahtarı doğru.
`e2e_resume.py`: eksikleri-tamamla bağlamı doğru (`context_before` tam
dolu); `.meta.json` + kısmi dosya yazıldı.
`hang_test.py`: timeout=1s ile paket 3 istek/5.3sn — gerçek 180s ile
~9 dk/rota (bilinen sınır; SDK max_retries=0 sonrası bounded).
`gate_corpus.py`: 81 doğru çeviride 1 ret ('Rock and roll!' — kasıtlı).

## Birim testleri

`backend/test_translate_pipeline_r220.py` (23 test): think-strip +
parse önceliği, definitive sınıflandırma (400/content_filter vs 503/
timeout), reasoning-model kapısı (gpt-5/o1-o4 ↔ temperature/rol),
normalize_reply_ids (1-indeksli kayma + liste→beklenen-id eşlemesi +
kısmi-kesişim dokunulmazlığı), line_keeps_source/file_looks_turkish,
_name_localized, TranslationTruncatedError sınıfı, merge_many tek-yazım.

`test_golden_corpus.py` güncellendi: defect sözleşmesi devre kesicili
üst sınıra taşındı (`golden + blocked ≤ calls ≤ golden + blocked + 6`).

## Doğrulanmadı / sınırlar

- context_leak SIZINTI=1, KAYMA=1 — model "kaynak listeyi tekrar etme"
  ihlalini tek blokta yapıyor; mevcut kapılar kaldırmıyor (kayıt altında).
- Gerçek reasoning modeller (GPT-5/o3) canlıda denenmedi — parametre
  kapısı birim testle kilitli.
- ~9 dk/rota askı maliyeti: SDK max_retries=0 + 3 deneme × 180s üst
  sınır; kullanıcı iptali çalışır.
- Almanca ek olarak İsveççe/Fince gibi büyük-harfli diller — mevcut
  skip listesi {de,gsw,lb,yi}; gerekirse genişletilir.

## Windows etkisi

- Tümü Node/Python taraf mantığı; yeni bağımlılık yok; yol/fsync davranışı
  `series_memory` ile aynı (platform-safe lock + temp-write + rename).
- Backend paket testleri `test_translate_pipeline_r220.py` paket listesine
  dahil (`backend/test_*.py` glob'uyla otomatik).
