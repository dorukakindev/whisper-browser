# BROWSER_BUG_REPORT_207 — Kullanıcı çeviri-denetimi harness'i doğrulama turu (R253)

Tarih: 2026-09-29 · Kapsam: kullanıcının `ceviri-denetimi.zip` harness
paketinin tamamı (15 betik) master `beb8cc3` üzerinde koşturuldu.
Çıkan sonuç: **yeni bug yok** — R220–R223 çeviri-hattı düzeltmeleri
uçtan uca doğrulandı.

## Koşu ortamı

- `WB_REPO=/home/ubuntu/repos/whisper-browser`, `MOCK_PORT=8810`
- `mockapi.py` (senaryo dosyalı sahte OpenAI-uyumlu sağlayıcı) arka planda
- Python betikleri `backend/venv/bin/python` ile (betikler `sys.executable`
  kullanıyor — sistem python3'ünde `openai` yok; ilk koşu bu yüzden 0 istek
  üretti, venv ile tekrarlandı)
- jsdom: `NODE_PATH=<repo>/node_modules`

## Sonuçlar (betik bazında)

| Betik | Sonuç |
|---|---|
| `gate_corpus.py` | 1/81 "reddedildi" — `'Rock and roll!'` eko satırı. R220 eko-kabul yolu iş seviyesinde devrede; korpuın satır-kapısı ölçümü yankıyı hâlâ işaretler (ölçüm artefaktı, regresyon değil). |
| `gate_corpus2.py` | 0/20 + 0/13 reddedildi — PASS |
| `fuzz_parts.js` | 20.000 rastgele girdi — sorun yok — PASS |
| `pairing_test.js` | Aynı `start`'lı cue'lar doğru çeviriyle eşleşti — PASS |
| `term_cache.js` | Terim KAPALI 2. izleme 0/60; terim AÇIK 2. izleme 30/60, 3. 27/60 — önbellek anahtarı terminologyVersion içerir; öğrenme açıkken yeni terimler anahtarı değiştirir (bilinen tasarım bedeli). |
| `replace_links2.js` | Link'li bloklar replace+bilingual modlarda doğru — PASS |
| `live_page.js` | 30 sn canlı sayfa: 29 otomatik-devam mesajı, 39 yeni blok — PASS |
| `e2e_gates.py` | 81 satır → 6 istek, exit 0; yalnız kasıtlı-değişmez satır kaynak dilde — PASS |
| `e2e_protocol.py` | 18 senaryo: kesin hatalar hızlı exit 1 dosyasız; geçici 429 `Retry-After` ile 5 istekte tam başarı; kalıcı drop/truncate → `.partial.srt`; `context_leak` dedektörü SIZINTI=1 KAYMA=1 yakaladı — PASS |
| `e2e_cache.py` | Aynı dosya 2. koşu 0 istek; içerik-anahtarlı (dosya adı biçimi/genişlik geçersizleştirmez) — PASS |
| `e2e_resume.py` | Eksikleri-tamamla artık gerçek önce/sonra bağlamıyla grupluyor — R220 düzeltmesi uçtan uca kanıtlı — PASS |
| `hang_test.py` | timeout=1s'de tek paket 3 HTTP isteği/5.3 sn (~9 dk worst-case 180sn'de; düzeltme öncesi ~72 dk) — iyileşme doğrulandı |
| `sched_test.js` | 7/7 GEÇTİ — yarış/iptal/devre-kesici sınırlı; 20k cümlede seek 7 ms |
| `browser_http_test.js` | Kesin hatalar 1–4 istek; 503 devre kesiciyle sınırlı; kısa-çeviri birleştirme çalışıyor — PASS |

## Değerlendirme

- **Echo-accept metriği:** `gate_corpus`'un 1/81'i ve `e2e_gates`'in
  "İngilizce kalan 1/81"i aynı kasıtlı satır — korpu dictionary'si
  `'Rock and roll!' → 'Rock and roll!'` veriyor ve satır eko-kabulle
  değişmeden yazılıyor (önbelleğe de girer). Davranış doğru; metrik
  bu durumu "başarısızlık" sayacak şekilde tasarlanmış, rapor burada
  notlandı — korpu güncellemesi gerekmez.
- **503/timeout hacmi:** tek cümle kalıcı 503'te 6–12 istek hâlâ
  devre kesici tavanı; kullanıcı raporundaki hedefe (sınırlı) ulaşıldı.
- Yeni ürün kodu değişikliği gerekmedi; tur tamamen doğrulama.

## Açık işler

- #187 `auto`-kaynak ordinal needs_human — kullanıcı kararı.
- devin-3c20a465 Windows el-kontrolü sürüyor.
