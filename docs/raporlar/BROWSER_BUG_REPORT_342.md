# BROWSER_BUG_REPORT_342 — Kuyruk-50 madde 30: çok dosyalı çıktı işlemleri

Tarih: 2026-10-01 · Başlangıç: `765060f`

## Denetim

- `transcribe()` ana yolu zaten `OutputTransaction` kullanıyor (tüm formatlar
  staged → tek commit; açılışta `recover_output_transactions`). Kusur yok.
- **`reexport_from_json` boşluktu:** her format `atomic_text_writer` ile tek
  tek DOĞRUDAN yazılıyordu → yazım ortasında çökme/iptal "srt yeni, vtt eski"
  tutarsız kümesi; journal'sızlık yüzünden yeniden açılışta yarım işlem
  tanınmıyordu.
- `write_srt_raw` (senkron aracı) tek dosyalık atomik yazı — kapsam dışı.

## Düzeltme (`backend/transcribe.py`)

- `reexport_from_json` yazım döngüsü `OutputTransaction`'a taşındı: girişte
  `recover_output_transactions(output_dir)`, her format `output_tx.stage`
  ile staged dosyaya, sonunda `output_tx.commit()` ile atomik yerine koyma.
- Herhangi bir hata/iptalde `output_tx.rollback()` → final'ler hiç
  dokunulmadan eski sağlam küme korunur.
- "Yazıldı:" günlükleri commit'ten sonra basılır (final dosya ancak o zaman
  gerçekten oradadır).

## Kanıt — `backend/test_reexport_transaction.py` (3/3 PASS, venv)

1. Tutarlı küme + sıfır artık + tek `done` olayı.
2. Mid-write OSError enjeksiyonu: eski srt/vtt içeriği bozulmadan kalır,
   ass hiç oluşmaz, artık yok; iyileşme sonrası temiz küme.
3. Ölü-pid `prepared` journal'ı: açılışta geri alınır, uyarı olayı basılır,
   ardından tutarlı yeni küme yazılır.

## Windows etkisi

Yol/journal mekaniği `pathlib`/`os.replace` — platform-nötr. Windows'ta
kilitli dosyada rollback defer uyarısı zaten pipeline_control'de var
(değişmedi). Gerçek Windows koşusu doğrulanmadı (Ubuntu CI).
