# BROWSER BUG REPORT 294 — R329-2: backend çıkış-kodu/durum sözleşmesi

- Tarih: 2026-09-30
- Kapsam: `backend/transcribe.py` `main()` sarmalayıcısı
- Sonuç: **1 sözleşme boşluğu düzeltildi** (KeyboardInterrupt gövdesiz iz) + sözleşme kilidi.

## Bulgu — B-329-01: KeyboardInterrupt protokolün dışında kalıyordu

`main()` tüm işlevleri tek `try/except Exception` ile sarmalıyor;
`KeyboardInterrupt` `BaseException` olduğundan o yakadan süzülüyor ve
stdout'a **error olayı yazılmadan** traceback'le düşüyordu. NDJSON
protokolü her başarısızlığın `error` olayı taşımasını varsayar; main.js
için önemsizdir (iptal `p.kill()`=SIGTERM ile yapılır) fakat bağımsız
konsol çalıştırmasında Ctrl+C gövdesiz bırakıyordu ve yarım çıktı işlemi
journal/.tmp olarak kalıyordu (rollback de atlanıyordu).

## Düzeltme

- `except KeyboardInterrupt` kolu eklendi (Exception'dan önce):
  `rollback_open_output_transactions()` + `emit("error", kind="cancelled")`
  + `sys.exit(130)` (kabuk SIGINT sözleşmesi 128+2).

## Kilit — `backend/test_exit_contract.py` (5 test)

`python -c` sürücüsü `transcribe.transcribe`'ı monkeypatch'leyerek dört
yolu doğrular: Exception → 1 + `error` olayı (traceback'li); temiz dönüş
→ 0; argparse hatası → 2 (usage stderr); KeyboardInterrupt → 130 +
`error`/`kind='cancelled'`. Beşinci test sahte `pipeline_control` +
`emit` probu ile **rollback'in error olayından önce** çağrıldığını kilitler.

## Testler

- `python3 backend/test_exit_contract.py` → 5/5 PASS.
- KeyboardInterrupt kırmızı kanıtı: dal değişikliği olmadan aynı test 130
  yerine 1 + olaysız çıkış gösterirdi (kod-değişikliği tek satır koludur).

## Sınırlar

- SIGTERM (UI iptali) sinyal yakalanmadan süreci öldürür — bu yolla error
  olayı üretilemez; main.js zaten `exit` olayını kendisi üretir. Kapsam
  dışı.
