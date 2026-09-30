# R323-5 — Ayar şeması hostile-deserialize fuzz'ı

**Tarih:** 2026-09-30 · **Dal:** `devin/1790765021-r323-5-settings-hostile`

## Bulgu: B-323-03 — okuma yolu kirlilik-anahtarı taramasından muaf (DÜZELTİLDİ)

`readPublicSettings` settings.json'u yalnız üst-düzey tip kapısıyla süzüyordu. Kayıt yolundaki `sanitizeSettings` → `scanJsonShape` (DANGEROUS_KEYS: `__proto__`/`prototype`/`constructor`, derinlik ≤ MAX_JSON_DEPTH, düğüm ≤ MAX_JSON_NODES) ise yalnız **kayıt** anında çalışıyordu.

**Zincir:** crafted `settings.json` (`{"ui":{"__proto__":{…}}}`) → `readPublicSettings` geçirir → renderer'a akar → `scheduleSave` → `saveSettings` → `sanitizeSettings`→`scanJsonShape` throw → **saveSettings try'ında yutulur → kalıcılık sessizce ölür** (dosya silinene dek her kayıt reddedilir). Üstelik proto-kirlenmiş `playerPositions` nesnesi `player.positions[key] = …` atamalarında prototip-ezme yüzeyi açar.

**Düzeltme:** `readPublicSettings` üst-düzey her anahtar için önce DANGEROUS_KEYS anahtar testi, sonra `scanJsonShape` alt-ağaç taraması; düşen yalnız o bölüm (`settingsFileCorrupt` işareti + mevcut forenzik yedek akışı korunur). `DANGEROUS_KEYS` artık export.

**Ek belt:** `sanitizePlayerPositions` doğrudan çağrıda da kirlilik anahtarını atlar (eşdeğer normalize kontrolü — `normalizedKey` alt çizgileri sildiği için scanJsonShape'inkiyle aynı kalıp kullanıldı).

## Diğer denetlenen yüzeyler (temiz)

- `sanitizeSettings` 600+ hostile yükte yalnız `SettingsValidationError` fırlatıyor; çıktı proto'su her zaman `Object.prototype`, tehlikeli anahtar sızmıyor.
- `sanitizeUiSettings` strict/lenient ayrımı doğru: yerel kayıtta tek bozuk alan diğerlerini öldürmez; import katı.
- `migrateSubtitleModelDefault` tip-bozuk `translate`/`ui` şekillerinde çöküşsüz.
- `withDefaultMediaFolders` mutlak-olmayan/tip-bozuk yollarda varsayılana döner; spread `__proto__`'yu own-prop olarak taşır (prototip değişmez).
- `playerPositions` tüketicileri (`player.positions[key]`, `Object.keys` budama) own-prop tabanlı; `for..in` kalıbı kodda yok.
- Dosya-boyutu Notu: settings.json'da ~MB'lık tek string'ler load'da sınırsız (renderer'a akar) — UI kontrolleri save'da boundedString'den geçtiği için sömürü yüzeyi dar; notlandı, düzeltilmedi.

## Testler

- `tests/settings-hostile-fuzz.test.js` → 9/9 (B-323-03 testleri master'da FAIL, dalda PASS)
- Regresyon: settings-backcompat, settings-load-corruption, browser-hardware-acceleration vm-dilimlerine yeni bağımlılıklar eklendi — hepsi PASS; ilgili 9 settings testi yeşil.

## Windows etkisi

Yok — platform bağımsız.
