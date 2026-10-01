# Açık kararlar indeksi (needs_human)

Devin Review ve el-kontrol turlarında `needs_human` işaretlenen / kullanıcı
kararı bekleyen maddelerin tek çatı listesi. Yeni bir `needs_human`
raporlandığında buraya eklenir; kullanıcı karar verdiğinde madde "Kapandı"
bölümüne taşınır. Son güncelleme: 2026-10-01 (R332).

## Kullanıcı kararı bekleyenler

| # | Kaynak | Madde | Beklenen karar |
|---|--------|-------|----------------|
| 1 | PR [#187](https://github.com/dorukakindev/whisper-browser/pull/187) | `auto` kaynak-dilli işlerde ordinal sayımı kaynak dilinde çalışamıyor | Review önerisi: `.tr.srt` benzeri sonekten kaynak dili türetilsin mi? (thread'de analiz var) |
| 2 | PR [#223](https://github.com/dorukakindev/whisper-browser/pull/223) | Steam sayfalarında Cloudflare kontrolü bekletmesi | Site-özel bekleme/bypass politikası onayı (thread'de analiz var) |
| 3 | devir `2026-09-28-1500` | `applySourceSnapshot` düzenleme-yazma reddi | Kaynak-anlık görüntüsü yazımına izin verilsin mi? (kayıtlı açık) |
| 4 | PR [#152](https://github.com/dorukakindev/whisper-browser/pull/152) | Echo-accept satırları TM'e yazılmıyor (R223 ile zehirlenme kapandı) | Tasarım gereği kabulü onayı — thread'de analiz |
| 5 | PR [#165](https://github.com/dorukakindev/whisper-browser/pull/165) | Ctrl+K komut paletinde sorguyu *seçer* | Chrome/Ctrl+L kuralına göre bilinçli davranış; onaylanırsa kapanır |
| 6 | devir `2026-09-29-2304` | Üç-nokta-dışı metinde in-place mutasyon sınırı | Bilinçli sınır olarak kabul / kapsam genişletme |
| 7 | devir `2026-09-30-0800` | `win-traversal` Linux ayıracı probu | Windows'a özgü kabul; onaylanırsa kapanır |
| 8 | PR [#184](https://github.com/dorukakindev/whisper-browser/pull/184) | Proxy'li ortamda DNS-pinning: istemci DNS'i proxy çözer, sabitleme uygulanamaz | Tam çözüm CONNECT-tünelleme/varlık-mimarisi turu gerektirir — kapsam onayı |
| 9 | PR [#184](https://github.com/dorukakindev/whisper-browser/pull/184) | `whisper-assets` nonce URL'si yalnız ASS alan sayfaya görünür | Tam kapanma varlık-mimarisi değişikliği ister — kapsam onayı |
| 10 | Blueprint önerisi (CJK/emoji fontları + xvfb) | Yeni snapshot'a font paketleri | Timeline'daki blueprint kartında onay bekliyor |

## İzlemede (otomatik ilerleyen)

- **Windows el-kontrol oturumu** `devin-3c20a465`: R236 tur-3 §3/§4 liste +
  NTP imleç + PDF açma doğrulaması — oturum suspend, rapor gelince triage.

## Kapandı (kayıt)

- **Site-chip reklam engelleyici global-vs-site tercihi** — R236 (PR #172)
  site bazlı korumayı uyguladı → çözüldü.
- **Sekme önizleme kartı kırpması** — R239/R240 (PR #178/#180) is-compact
  varyantıyla çözüldü.
- **Eko-kabul TM zehirlenmesi** — R223 (PR #153) bekçiyle çözüldü;
  kalan needs_human satır 4'te ayrı.
