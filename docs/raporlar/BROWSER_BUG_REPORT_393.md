# BROWSER_BUG_REPORT_393 — Birleşik master tam-suit onarımı (29 kırmızı dosya)

**Tarih:** 2026-10-02 · **Dal:** devin/<timestamp>-merge-drift-repair
**Tetikleyici:** Windows makinede `npm test` tam koşusu → 481/510 geçti, 29 dosya kırmızı.
**Kök neden:** Kampanya batch'leri ortak kodu (helper'lar, izleyiciler, CSS, locale) değiştirdi;
görev kuralı yalnız değişen-alan testi koştuğu için birleşik master'da tam suit hiç koşmamıştı →
drift sessizce birikti (BROWSER_BUG_REPORT_394.md'de sınıflandırma).

## Düzeltilenler (Ubuntu'da üretilebilir drift — ~10 dosya sınıfı)

| Dosya | Sınıf | Düzeltme |
|-------|-------|----------|
| tests/adversarial-ipc.test.js | VM-slice stub | `networkOnline: () => true` + `markOwnSubtitleWrite: () => {}` ctx stub'ları |
| tests/browser-profile-jobs.test.js | VM-slice stub | `openAppDialog` + `uiText` ctx stub'ları |
| tests/validation.test.js | VM-slice stub | `writeSubtitleAtomic` slice'ına `markOwnSubtitleWrite` parametresi |
| tests/local-sync-profiles.test.js | VM-slice | `subLangFromPath` dilimi eklendi (`languagePrefHint` son işareti) |
| tests/subtitle-output-contract.test.js | VM-slice stub | `subLangFromPath`/`seriesKeyForPlayer` extract + 11 ctx stub'ı |
| src/main.js | resource-leak-inventory | `fs.watch` → 2 sn aralıklı `fs.stat` modeli (mtime + 400ms debounce; aynı semantik) |
| src/renderer/styles.css | css-hardcoded-colors + design-system | 8 sabit renk token'a çevrildi (439→430); 2 `:focus-visible{outline:none}` kaldırıldı |
| src/renderer/ui-locale.js | i18n-coverage/ui-locale/dialog-locale | 32 eksik EN sözlük girdisi (kurtarma/ön kontrol/pdf-kapsam + sink dizgileri) |
| tests/dom-innerhtml-ratchet.test.js | ALLOWED drift | 11 bayat satır iğnesi güncellendi; 6 yeni girdi (escape'li yerel derlemeler + sayısal kıvılcım) |
| src/renderer/renderer.js | player-ui + innerhtml | 3 `×`/`textContent` dinamik kapatma → `browserCloseIcon()` SVG; cache/hwguide satırlarında `escapeHtml` (lokal `esc` takma adı kaldırıldı, `r.kind`/`gpuName`/`cpuName`/`r.id`/`r.state` kaçışlandı) |
| tests/settings-roundtrip.test.js | fikstür drift | 7 yeni persist kontrolü sözlüklere eklendi (networkBudget, translatePrice*, min/maxSpeakers, speakerMap, abModel) |
| tests/browser-reading-design.test.js | VM-slice stub | `fakeClassList` artık `add`/`remove` destekliyor (profile-chip çağrısı) |
| tests/browser-subtitle-selection.test.js | VM-slice stub | `browserTrackSourceLanguage`/`subLangFromPath`/`updateSubCompareButton`/`scheduleSubtitleWatchRefresh` stub'ları |
| tests/browser-subtitle-sync-renderer.test.js | VM-slice stub | `browserCloseIcon` stub'ı (× → SVG geçişi) |
| tests/browser-ui-regressions-r3.test.js | VM-slice stub + sözleşme | `interfaceChoice` stub'ı + sayfa-kapsam durum satırı beklentisi |
| docs/raporlar/INDEX.md | docs-index-integrity | R392 satırı eklendi (batch 9+10 raporu indekssiz kalmıştı) |
| backend/test_scene_context.py | taşınabilirlik | `open()` → `encoding='utf-8'` (cp1254 Türkçe Windows'ta patlıyordu) |

## Windows'a özgü kalanlar (bu tarafta üretilemez — codex dalı sahibi doğrular)

- `unicode-paths` — `python3` takma adı eksik (Windows Store stub veya PATH)
- `auth-io-deadzone` — POSIX yol beklentisi (test Windows-güvenli değil)
- `report127` — teardown `EPERM` (Windows dosya kilidi/AV)
- `docs-index-integrity` (Windows tarafı) — ajanın 9 untracked devir notu indekslenmemiş (onun PR'ında çözülür)

## Doğrulama

- Tam `npm test` birleşik master üzerinde: çalıştırıldı (sonuç aşağıda).
- Düzeltilen dosyalar tekil: adversarial-ipc 18, browser-profile-jobs 13, validation, local-sync-profiles,
  subtitle-output-contract, player-ui 153/153, settings-roundtrip 10, docs-index-integrity 584+352,
  dom-innerhtml-ratchet, pdf-* 9 dosya, unicode-paths 2429, auth-io-deadzone, css 430/430,
  i18n-coverage, dialog-locale, ui-locale 14, resource-leak-inventory 15, subtitle-export-validation — hepsi PASS.
- `node --check` main.js/renderer.js/ui-locale.js — temiz.

## Windows etkisi

- `fs.watch` → stat-polling: Windows'ta dizin izleme zaten kilitlenme/AV sorunlarına açıktı;
  aralıklı stat modeli orada DAHA güvenilir. `start.bat` akışı etkilenmez.
- `browserCloseIcon` SVG'si mevcut yardımcıyı yeniden kullanır — yeni görsel davranış yok.
- cp1254 düzeltmesi doğrudan Türkçe-Windows taşınabilirliğini onarır.
