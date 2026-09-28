# BROWSER_BUG_REPORT_167 — R187 yakalama/indirme dayanıklılığı derin denetimi

Tarih: 2026-09-28 · Dal: codex/r187-capture-durability-1790542829 · Temel: master `e388f00` (R186 dahil)

Kapsam: tarayıcı altyazı yakalama, indirme ve burn-in kurtarma zincirinin uçtan uca dayanıklılık
denetimi + uzatılmış kaynak soak'u (600 yakalama + 80 hazırda-bekletme döngüsü). Amaç: uzun
oturumlarda veri kaybı, bellek sızıntısı, yarım dosya veya takılan durum makinesi üreten kusur
sınıflarını yakalamak.

**Sonuç: doğrulanmış yeni bug bulunmadı.** Ürün kodu değişmedi; aşağıdaki kanıtlar ve sınır
notları kalıcı kayıt olarak bırakıldı.

## Denetlenen yüzeyler ve bulgular

### İndirme zinciri (`src/browser-downloads.js`, 149 satır)
- Kalıcı kayıt 100 satırla kapalı; terminal kayıtlarda URL **kasıtlı tutulmuyor** (gizlilik
  tasarımı) — kesilen indirme geçmişten devam ettirilemez. Davranışsal not: `Devam et` düğmesi
  terminal satırlarda zaten gizli (`canResume` yalnız canlı oturumda), ölü affordance yok.
- `persistTerminal()` kayıt hatasında `message` alanını doldurur ve çağıranın `changed()`
  akışıyla UI'a ulaşır — yayımsız kalan mesaj patolojisi doğrulanamadı (boş iddia).
- `done()` içinde `updated` dinleyicisi kaldırılır, `done` once ile kendini temizler — çift
  dinleyici yok.

### Yakalama hattı
- `browser-network-capture.js` (149): 12 MB gövde sınırı + TTL/dedupe budaması yerinde.
- `browser-dash-capture.js` (73): 6'lık yığınlar, 64 MB tavan, `current()` staleness kontrolü.
- `browser-acquisition.js` (234): basamak durum makinesi — her basamak success/skipped/failed
  ile kapanır; `complete` yalnız kazanan basamakta.
- `browser-capture-recovery.js` (32) + `hls-recovery.js` (187): yeniden-yakalama kararları
  sınır/bekleme disiplinli.
- `browser-cea-checkpoint.js` (103) + `browser-cea-full-capture.js` (191): kesinti sonrası cue
  metni checkpoint'ten döner; segment kimliği `seq:N` (discontinuity değil) üzerinden — rolling
  playlist refresh'inde URL-anahtarlı eşleşme doğru. **Belgeli sınır:** mux.js çözücü durumu
  serileştirilemez — kurtarma plan başından dekoderi yeniden oynatır (cue metni korunur).
- `runOrderedCeaCapture` ilk hatada `paused` durur — CEA-608/708 çözücü sıralaması korunur
  (rasgele atlamak bozuk caption üretirdi; bilinçli tercih).
- Uçuştaki fetch'ler pause'da await edilip atılır — "hung fetch" patolojisi yok.
- `manifest-transactions.js` (224): backoff + cooldown registry; `inFlight` kümesi teorik
  sınırsız ama tüm çağıranlar settle ediyor (denetlendi).

### Burn-in kurtarma (`src/browser-ass-renderer.js`, `src/burnin-output.js`, main.js 18231–18560)
- Yarım burn-in çıktıları PID + süreç-adı eşleşmesiyle toparlanır; orijinal dosya `.bak`
  yedeğinden geri yüklenir. Yeniden başlatma sonrası sarkan geçici dosya/dizin temizliği var.
- JASSUB tutkunu operation-id çitlemesiyle eski işlemin geç yazmasını engeller; detach'te
  kaynaklar sökülür.

### CEA çekirdek makine (main.js 9200–10560)
- cc_data çıkarma, kanal alan eşlemesi, PAC/özel-komut çözümleme, roller modelleri derin
  okundu; sınırlar ve kod sayfası eşlemeleri tutarlı.

### Sayısal süpürme
- renderer.js içindeki 481 `parseFloat`/`parseInt`/`Number` sitesi ve tüm
  `e.target.value` doğrudan-sayı kullanımları tarandı. Tek aday `player.offset =
  parseFloat(e.target.value)` — giriş `type="range"` olduğundan NaN üretemez; **bug değil**.
  `playerSeek`/`playerSpeed`/`shiftSeconds` siteleri isFinite veya `||` korumalı.

### Tek-commit yüzeyler (hiç düzeltilmemiş modüller)
`async-timeout`, `atomic-json`, `browser-ai-context`, `browser-asset-gc`,
`browser-audio-policy`, `browser-context-menu`, `browser-dark-mode`, `browser-link-intent`,
`browser-live-audio`, `browser-mini-preload`, `browser-translation-provider-error`,
`browser-youtube-style`, `gpu-diagnostics`, `media-subtitle-tracks`, `ndjson-lines` —
15 modül, 842 satır tam okundu; sınır kapıları ve hata yolları yerinde.
`browser-cue-timeline-calibration` (96 satır) ayrıca incelendi — aynı sonuç.

## Dinamik kanıt — genişletilmiş soak

`node tests/run-resource-soak.js --cycles=600 --hibernation-cycles=80`:

- Yakalama: **600/600 başarılı**
- Hazırda bekletme (gönder/geri-al): **80/80 başarılı**, baseline öncesi prime edilmiş
- `unhandledRejection`: **0**
- Yakalama tanısı son durum: `responsive`, `winner=persisted-track`, `complete=true`,
  `errors=0` — 600 döngü sonunda edinim hattı sağlıklı, takılı basamak yok.

## Davranış notları (bug değil, kayıt)

1. Kesilen tarayıcı indirmesi geçmişten devam ettirilemez — terminal kayıtta URL tutulmaz
   (gizlilik tasarımı). Kullanıcı dosyayı siteden yeniden indirir.
2. CEA kurtarma cue metnini korur ama dekoder plan başından yeniden oynatılır (mux.js durumu
   serileştirilemez) — canlı yakalamada yeniden-başlatma sonrası kısa gecikme normaldir.
3. `player.offset` gibi range input'lara `|| 0` eklemek gereksiz — DOM garantisi veriyor.

## Windows etkisi

Ürün kodu değişmedi — `install.bat`/`start.bat`, yol, karakter ve GPU akışı etkilenmez.
Doğrulanmamış sınır: soak bu kutuda headless Electron'da koştu; gerçek Windows'ta uzun oturum
izleme önerisi geçerli (R132 listesindeki el-kontrol maddesi aynen duruyor).
