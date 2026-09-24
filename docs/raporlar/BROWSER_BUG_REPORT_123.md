# R123 — master/dal eşitlemesi ve YouTube hesap-yenileme yarışı

Tarih: 2026-09-24. Başlangıç: yerel `codex/catalog-sync` ve `master` = `d1a02b1`; uzak `master` = `0937c7f` (birleşmiş PR #48). Bu turda açık PR bulunmadı. Eski, birleşmemiş deney/denetim dalları otomatik olarak master'a taşınmadı; R121'in izlenmeyen dosya denetimi de yeni ürün kodu bulmamıştı. Kullanıcının izlenmeyen dosyaları korunmuştur.

## Kesin bulgu: R123-01

- Kaynak: `src/main.js`, `ensureYoutubeAccessToken`. Tek global `_ytRefreshInFlight` hesabın kimliğini tutmuyordu; `invalid_grant` dönüşünde `removeAccount` çağrısı yenilenen hesabı değil, **o an etkin hesabı** siliyordu.
- Erişilebilir yol: A hesabının token yenilemesi başlar → kullanıcı B hesabına geçer → A için `invalid_grant` gelir → B silinir. Ayrıca B'nin eşzamanlı isteği A'nın uçuşunu paylaşıp yanlış token/başarısızlık alır. Hesap aynı kimlikle çıkarılıp yeniden eklenirse gecikmiş A sonucu yeni oturumu silebilirdi.
- Kullanıcı etkisi: hesap listesi/etkin seçim yanlış değişir; SmartTube beslemesi yanlış hesapta açılabilir veya girişsiz görünebilir. Mevcut `youtube-accounts.test.js` yalnız depo saf fonksiyonlarını denediği için bu ana-süreç eşzamanlılığını yakalamıyordu.
- Deterministik yeniden üretim: `tests/youtube-account-refresh-race.test.js` ertelenmiş sahte refresh sonucu ve hesap geçişi kullanır. İlk çalıştırmada `expected 2 refresh request(s), 1 !== 2` ile kırmızıydı.
- Düzeltme: uçuş hesabın ID/nesne kimliğine bağlandı; farklı hesap çağrısı ilk uçuşun bitmesini bekler, sonra kendi hesabını yeniler; geçersiz grant yalnız eski kimliği kaldırır; artık geçersizleşmiş hesap nesnesi sonucu yok sayılır.
- Doğrulama: yeni yarış testleri 4/4; mevcut `youtube-accounts` 7/7, `report70-youtube-oauth` 27/27, `report104-youtube-browse`, `report67-smarttube-wiring` 84/84, `ui-locale` 14/14; `node --check src/main.js` temiz. Gerçek YouTube hesabıyla Windows/Electron kabulü yapılmadı; tam `npm test` kullanıcı isteği uyarınca çalıştırılmadı.

İlişkili kod commit'i: `fbcdeae96eff295db293a58bd4badfa69d9e29fe`. Rapor, izlenmeyen eski worktree dosyalarının ürün kodu olarak güvenli kabul edildiği anlamına gelmez.
