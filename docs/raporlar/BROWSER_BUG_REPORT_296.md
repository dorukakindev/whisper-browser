# BROWSER BUG REPORT 296 — R329-4: LLM sağlayıcı varyant matrisi

- Tarih: 2026-09-30
- Kapsam: reasoning-model taksonomisi, endpoint rota matrisi, kural-sözlüğü erişilebilirliği
- Sonuç: **1 gerçek bug düzeltildi** (B-329-03) + 9 test kilidi.

## Bulgu — B-329-03: `resolve_translate_routes` aynı endpointi iki kez sıralıyordu

Dedupe `u.rstrip("/") != raw` dizgi eşitliğiyle yapılıyordu. Kullanıcı
SHUAI host'unu schemesiz (`oai.sb/v1`) veya büyük harfle (`https://OAI.SB/v1`)
girdiğinde ham dizgi kanonik rotayla eşleşmiyor → sonuç **5 rota** oluyordu:
kullanıcının ham biçimi + aynı endpointin kanonik biçimi. Etki: aynı
endpoint arka arkaya iki kez deneniyordu (gereksiz istek, geçici hatada
ikinci "farklı rota" aslında aynıydı).

**Düzeltme:** dedupe host eşleşmesiyle — `urlparse(u).hostname != host`.
4 SHUAI rotasının host'ları birbirinden farklı olduğu için tam olarak
eşleşen rota düşürülür; kullanıcının ham biçimi ilk sırada kalır
(yol/parametre korunur).

## Kilit — `backend/test_provider_matrix.py` (9 test)

1. **Reasoning taksonomisi:** 11 reasoning adı + 12 normal/sınır adı —
   her biçimde `is_reasoning_chat_model` + `llm_generation_kwargs` +
   `chat_generation_kwargs` + `chat_instruction_role` aynı kararı verir.
   Sınır vakalar: `gpt-50`/`o10` rakam soneki eşleşmez, `anthropic-o1`
   slashsız eşleşmez, `OpenAI/GPT-5` büyük harf eşleşir.
2. **Çapraz tutarlılık:** aynı modelde chat↔llm yolları aynı temperature
   kararını vermeli (biri güncellenip diğeri unutulursa yakalar).
3. **Rota matrisi:** 6 SHUAI biçimi → 4 rota/ilki verilen; 6 akraba-olmayan
   host → tek rota. Spoof kontrolleri kilitli:
   `api.shuaiapi.com.evil.com`, `oai.sb.evil.com`, sondaki-nokta varyantı.
4. **Kural erişilebilirliği:** `REGISTER_RULES` (5) ve `PROFANITY_RULES` (3)
   her anahtarı prompt çıktısında görünür; bilinmeyen anahtar
   general/medium varsayılanına düşer.

## Testler

- `python3 backend/test_provider_matrix.py` → 9/9 PASS (B-329-03
  düzeltmeden önce SHUAI-2 vaka FAIL).
- `test_resolve_translate_routes` + `test_translation_routes` (mevcut) → PASS.

## Sınırlar

- Gerçek ağ çağrısı yok; sözleşme düzeyinde kilit.
- 'api.shuaiapi.com.' (sondaki nokta) tek rota kalır — urlparse davranışı,
  kabul edilebilir (fan-out yok, çökme yok).
