# BROWSER BUG REPORT 245 — Çeviri önbelleği bozuk-girdi fuzz ratchet'i

**Tarih:** 2026-09-30 · **Kapsam:** Plan-3 madde 1 — `PersistentTranslationCache` journal/temel/yedek bozulma dayanıklılığı
**Sonuç:** Bug bulunamadı; 114 senaryoluk deterministik fuzz kilidi eklendi.

## Denetim
- **Günlük replay bozulması** (48 tohum): kesik JSON, sayı/dizge/null/dizi satırlar, `k` sayı/boş, `v` sayı/null/bool/yok (mezar taşı tuzağı — R224'ün düzelttiği sınıf), gelecek/negatif/devasa `t`, TTL aşımı, NUL baytlar → her yükte invariant'lar kilitli (limit, dizge anahtar/değer, çökme yok).
- **Temel dosya bozulması** (48 tohum): `entries` satırları çarpık tip/uzunluk, `updatedAt` eksik/yaşlı → elenme ve sınırlama doğru.
- **Şema-geçersiz gövdeler** (14 varyant): dizge/sayı/null/dizi/{}/version 0/3/"2"/entries-tip → `.bak`'a düşüş + arşivleme doğrulandı.
- **Kapasite kesimi**: 150 journal satırı + limit 100 → en yeni 100 kalır, eski temel kayıt dirilmez.
- **Roundtrip**: bozuk journal + temel → kurtarma → flush → compact → yeniden yükleme sadakati.
- **TM (sqlite)**: `TranslationMemory` init `try/except` + şema kapısı — bozuk veritabanı `log warn` ile `tm=None` (çökme yok), ayrı fuzz gerektirmez.

## Eklenen
`tests/translation-cache-fuzz.test.js` — mulberry32 tohumlu üreteç (Math.random yasak; R295 ratchet'iyle uyumlu), 114 senaryo.

## Sınırlar
- `v` dizge-olmayan satırların mezar taşı sayılmaması davranışı kilitli ama gelecek-zamanlı mezar taşlarının kazandığı senaryo bilinçli olarak invariant düzeyinde tutuldu (tasarım seçimi).
