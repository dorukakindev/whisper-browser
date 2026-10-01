# BROWSER_BUG_REPORT_355 — Madde 43: Gizli bilgi deposu kurtarma

**Tarih:** 2026-10-01 · **Dal:** devin/…-secret-vault-recovery · **Başlangıç master:** `49dc727`

## Denetim kapsamı

`src/secret-store.js` (`SafeSecretStore`) iki kasada kullanılır: `secrets.safe.json` (ayar anahtarları, 6 alan) ve `youtube-session.safe.json` (YouTube hesap token'ları, 9 alan). Hesap kaldırma akışı (`youtube:accountRemove`) ayrıca denetlendi: uçuştaki cihaz-kodu poll'ü öldürülür, revoke **kaldırılan hesabın** token'ıyla yapılır, kayıt ve persist sırası doğru — kusur yok. Anahtarlar hiçbir yolda log'a veya argv'ye taşınmıyor (token'lar spawn env'i, `error.message` yalnız hata sınıfı).

## Bulunan kusurlar

### B-355-01 Kısmi-bozuk kasa kayıt ölü-kilidi (düzeltildi)

`saveFromSettings`, `current.partial` durumunda **tüm** kayıtları reddediyordu. Bir alan çözülemiyorsa (keyring değişimi, OS yeniden kurulumu, bozuk kayıt) kullanıcı yeni anahtarını yazamazdı — "yeniden giriş" akışı çalışmıyordu. Tamamen çözülemeyen kasa da (`partial` sağlam alan gerektirdiğinden `ok:false`) aynı kilidi verirdi.

**Düzeltme:** `loadFile` artık çözülemeyen **ve** build'in bilmediği alanların ham şifreli metnini `rawEntries`'te döndürür. `save()` bu girdileri — yeni değer veya `dropFields` ile ezilmedikçe — olduğu gibi korur. `saveFromSettings` ret kapısı "hiç kurtarılabilir girdi yok" (sert-bozuk JSON / yeni-sürüm dosyası) olarak daraltıldı; çözülemeyen girdiler ham haliyle korunarak kayıt ilerler.

### B-355-02 `save()` çözülemeyen girdileri sessizce yok ediyordu (düzeltildi)

`persistYoutubeSession` doğrudan `store.save()` çağırır — `load` kontrolü yoktu; yarı-bozuk bir `youtube-session.safe.json` üzerine yazım çözülemeyen token girdilerini **kurtarılamaz** biçimde silerdi (kullanıcı yeniden giriş yapana dek bekleyen olası-kurtarılabilir kayıt). `save()` artık mevcut dosyayı önce çözümler ve ham girdileri korur.

### B-355-03 Yalnız-temizleme kasa dosyasını yeniden yazmıyordu (düzeltildi)

Kullanıcı bir anahtarı temizlediğinde yeni sır girilmemişse `saveFromSettings` erken `ok` dönüyordu — `clearedSecretFields` işareti merge'te onurlandırılıyordu ama **şifreli metin kasada kalıyordu**. Artık yalnız-temizleme kasayı yeniden yazar ve `dropFields` ile girdiyi düşürür (kasa kullanılamıyorsa işaret yine geçerli).

### B-355-04 Sürüm/bilinmeyen-alan dayanıklılığı (düzeltildi)

`version !== 1` katı reddi eski sürüm kayıtlarını okuyamıyordu; yeni build'in yazdığı bilinmeyen alanlar geri-yazımda kaybolurdu. Artık `1 ≤ version ≤ SECRET_STORE_VERSION` kabul; üstü tanınmaz (üzerine de yazılmaz), bilinmeyen alanlar ham korunur (downgrade güvenli).

## Kanıt

- `node --check src/secret-store.js` — temiz
- `node tests/secret-store-recovery.test.js` — **25 kontrol** (yeni dosya): partial yazım, yeniden-giriş değişimi, dropFields temizliği, yalnız-temizleme, bilinmeyen alan, sürüm kapısı, boş-çözen girdi, unavailable kasa
- `node tests/crash-integrity.test.js` — geçti (mevcut store senaryoları)
- `node tests/report63-secret-redaction.test.js` — 19 test geçti

**Windows etkisi:** `safeStorage` Windows'ta DPAPI kullanır; makine/kullanıcı değişimi aynı çözülememe senaryosunu doğurur — düzeltme doğrudan Windows'un gerçek kullanım senaryosunu korur. UI değişikliği yok (denenmedi — gerekmez).
