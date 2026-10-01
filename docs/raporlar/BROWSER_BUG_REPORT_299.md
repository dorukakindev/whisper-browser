# BROWSER_BUG_REPORT_299 — R331: AI modları (--explain) düzeltme turu

- Tarih: 2026-10-01
- Dal: `devin/1790814199-r331-ai-modlari` (kullanıcı patch'i `r331-ai-modlari.patch` `git am` ile)
- Kapsam: kullanıcının gönderdiği R331 paketi — `--explain` (Açıkla / Kelime / Çeviriyi değerlendir) modu + AI sohbet çipleri

## Özet

Kullanıcı paketi; 5 bağımsız hata sınıfı tek commit'te düzeltildi. Doğrulama: patch'in
getirdiği `backend/test_explain_mode.py` 8/8 PASS, `dom-innerhtml-ratchet.test.js`
allowlist satır-şifresi güncellemesiyle PASS. `git am --3way` temiz uygulandı
(CHANGELOG ile güncel master'daki R320 satırı çakışmadı).

## Düzeltilen bulgular (paket içeriği)

1. **B-331-01 — Reasoning modellerinde `--explain` her seferinde düşüyordu.**
   `explain_subtitle` her modele `temperature=0.3` + `system` rolü gönderiyordu;
   gpt-5/o-serisi bu ikisini 400 ile reddediyor. `--chat`'teki `is_reasoning_chat_model`
   / `chat_instruction_role` ayrımı `--explain`'e taşındı: reasoning modelleri
   `developer` rolü + `max_completion_tokens` alır, klasik modeller eski davranışta kalır.
   `explain_generation_kwargs()` yeni saf fonksiyon.
2. **B-331-02 — Tek rota ~18 dk asılı kalabiliyordu.** SDK istemcisi
   `timeout=120` + kendi 2 denemesi × `call_api_with_retry` 3 deneme çarpıyordu.
   İstemci artık `timeout=60, max_retries=0`; yeniden deneme yalnız wrapper'da.
   `cancellation_checkpoint("llm")` istek öncesi/sonrası eklendi; `PipelineCancelled`
   yakalanıp tekrar fırlatılır.
3. **B-331-03 — Çelişkili talimat.** "Kelime"/"Çeviriyi değerlendir" kuralları sabit
   "Türkçe karşılık" istiyordu; hedef dil İngilizceyken model hem TR hem EN istemi
   alıyordu. Kurallar artık `{lang}` yer tutuculu, `build_explain_prompt` hedef dile
   göre dolduruyor. Talimat metinleri diakritikli düzgün Türkçeye çevrildi.
   `better` modunda `mevcut_ceviri` boşsa "değerlendirilecek çeviri yok" denir,
   alternatif uydurulmaz. Hata metinleri ham istisna yerine `ai_friendly_error_message`
   (yeni ortak yardımcı; `chat_about_video`'nin kopya sözlüğü silindi).
4. **B-331-04 — Sohbet hazırlanırken veya AI süreci kapanmadan Açıkla başlatılabiliyordu.**
   `askExplain` kapısına `aiChatPreparing || player.job?.awaitingExit` eklendi; eski
   sürecin `exit` olayının yeni işe yazılması engellendi. Job-exit kolunda
   `updateMakeTransState()` çağrısı eklendi (düğme durumu güncellenmiyordu).
5. **B-331-05 — EN arayüzde çip etiketi çevriliyordu ama soru Türkçe gidiyordu.**
   Her `.ai-chip` düğmesine `data-ask-en` eklendi; click handler `UiLocale.get()==='en'`
   ise EN soruyu gönderir. TR çip metinleri doğallaştırıldı.

## Test

| Komut | Sonuç |
|---|---|
| `backend/venv/bin/python backend/test_explain_mode.py` | 8/8 PASS |
| `node tests/dom-innerhtml-ratchet.test.js` | PASS (allowlist satır kayması güncellendi) |

`test_explain_mode.py` kilitleri: prompt'ta `{lang}`/sabit "Türkçe karşılık" yok;
`better` boş-çeviri koruması; bilinmeyen kind → sentence; reasoning'de temperature yok +
developer rolü + `max_retries=0` + `timeout<=60`; klasik modelde system+0.3 korunur;
hata metni friendly; `ai_friendly_error_message` sözleşmesi.

## Doğrulanmayan sınırlar

- Gerçek sağlayıcıyla (gpt-5-mini gibi reasoning model) canlı `--explain` çağrısı yapılmadı;
  sahte OpenAI istemcisiyle parametre sözleşmesi kilitlendi.
- Windows'ta elle UI doğrulaması yok (Linux Electron smoke kapsam dışı bu turda).

## Windows etkisi

Yok — yalnız backend parametreleri ve renderer metin/click mantığı; IPC/yol/dosya adı
dokunulmadı.
