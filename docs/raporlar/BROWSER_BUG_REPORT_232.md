# BROWSER_BUG_REPORT_232 — R283: çeviri prompt'u golden-snapshot kilidi

## Özet
`build_translate_prompt` / `build_refine_prompt` tam çıktısı ve sağlayıcı-model
parametre tablosu (`is_reasoning_chat_model` → `chat_instruction_role` /
`chat_generation_kwargs`) `backend/testdata/translate_prompt_golden.json`
dosyasına byte-exact kilitlendi. Bug bulunmadı; amaç regresyon kapısı.

## Kapsanan yüzey
- 5 temsilî çeviri-prompt varyantı (dil çifti × register × profanity ×
  glossary / auto_glossary / series_hint / use_context aç-kapa, max_cps/width).
- 3 refine-prompt varyantı (tr, en, büyük-harf TR — TR kural bloğu kapısı).
- 11 model adı için reasoning/role/kwargs tablosu (gpt-5, o-serisi,
  deepseek-r1, qwen3, claude, kimi…).
- Ayrıca üretici-matris ratchet'leri: her `REGISTER_RULES`/`PROFANITY_RULES`
  anahtarı prompt'ta gerçekten yer alır; bilinmeyen register `general`'a düşer.

## Doğrulama
- `python3 backend/test_translate_prompt_golden.py` → 6 test, OK.
- Yeniden-üretim komutu byte-identical üretiyor (deterministik).

## Sonuç
Temiz — regresyon kilidi eklendi, ürün kodu değişmedi.
