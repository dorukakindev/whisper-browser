# BROWSER_BUG_REPORT_327 — Kuyruk görevi 15: konuşmacı düzeltme akışı

- Tarih: 2026-10-01 (UTC)
- Dal: `devin/1790882432-item15-speaker-rename` (taban `1fb15a6`)
- Kapsam: `backend/transcribe.py`, `src/main.js`, `src/renderer/*`

## Görev metni (kuyruk 15/50)

"Konuşmacı düzeltme akışı: Otomatik konuşmacı etiketlerini inceleme, yeniden
adlandırma ve birleştirme imkânını geliştir. Düzeltmeler altyazı biçimlerine
aktarılırken zamanlar ve metin korunmalı."

## Mevcut uygulamanın gereksinim karşılığı (denetim sonucu)

| Gereksinim | Önceki durum | Kanıt |
|---|---|---|
| Otomatik etiketler | VAR | `assign_speakers` → `{i: "SPEAKER_XX"}`; SRT/VTT/TXT `[SPEAKER_XX]` öneki; ASS SpeakerN stili + Name alanı; JSON `speaker` alanı |
| İnceleme | VAR | "N konuşmacı tespit edildi" log + ASS/JSON çıktıda ad listesi; `--max-speakers` sınırı |
| Yeniden adlandırma | YOKTU | Etiketler pyannote'dan doğrudan çıktıya akıyordu |
| Birleştirme | YOKTU | SPEAKER_00/01 aynı kişiyse tek tek kalırdı |
| Zaman/metin korunması | SÖZLEŞME | Etiketler cue verisinden ayrı haritada taşınır; `label_entries_for_text_output` yalnız önek ekler |

## Uygulananlar

- **`normalize_speaker_label`** — kontrol karakteri temizliği + 64 karakter sınırı
  (ASS Name alanı güvenliği korunur; virgül zaten yazımda `，`e çevrilir).
- **`parse_speaker_rename(raw)`** — üç giriş biçimi: JSON dict,
  `@dosya` yolu, `ESKİ=YENİ[,;…]` listesi. Bozuk/okunamaz girdi `{}` döner ve warn —
  yanlış yazılmış harita işi durdurmaz. Boş hedefler ve aynı-ada eşlemeler düşer.
- **`apply_speaker_rename(speakers_map, rename)`** — TEK geçişte yalnız orijinal
  ad üzerinden uygulanır: `A=B, B=C` zinciri A'yı C'ye ÇEVİRMEZ (çift-uygulama
  engeli). Aynı hedefe bağlanan etiketler otomatik birleşir.
- **Bağlantı noktaları**: `assign_speakers` çıkışının hemen sonrası (transkripsiyon)
  ve `reexport_from_json` içinde JSON'dan okunan harita sonrası — kullanıcı kayıtlı
  çıktıyı düzeltip formatları yeniden yazabilir (düzeltme akışının doğal yolu).
- **UI + IPC**: Diarization bloğunda "Konuşmacı düzeltmesi" metin alanı
  (`SPEAKER_00=Anne, SPEAKER_01=Anne`); EN/TR çifti; PERSIST_VALUE_CONTROLS;
  main.js `pushBoundOption` ile `--speaker-map=değer` (`-` başlangıçlı güvenli).

## Test kanıtı

- `test_speaker_rename_parse_and_apply` — normalize/parse/apply üç katman + @dosya
  okuma + bozuk-girdi matrisi + birleştirme + zincir-engeli + zaman/metin korunma
  sözleşmesi (`label_entries_for_text_output` çıktısı: zamanlar birebir, `[Anne]` öneki).
- `test_transcribe.py`: **220/220**. main-args 16/16, queue-opts-roundtrip 61.388
  kontrol, ui-locale serisi yeşil (placeholder da sözlükten çevrilir).

## Windows etkisi

`--speaker-map` argv'den gider; Türkçe içeren JSON/liste UTF-8 üzerinden bozulmaz
(spawn env'ine değil argv'ye — Türkçe karakter içeren değerler zaten R160 kilidi
altında). `@dosya` yolu Türkçe/boşluklu klasörü destekler (Path.read_text UTF-8).

## Bilinen sınırlar

- Birleştirme işlem bazlıdır; pyannote'un farklı işlerde ürettiği SPEAKER_XX
  numarası her koşuda değişebilir — kalıcı profil (medya kimliğine bağlı
  konuşmacı eşlemesi) bu madde kapsamı dışında, kuyruk 18 "parça bazlı senkron
  profilleri" ile ilişkili.
