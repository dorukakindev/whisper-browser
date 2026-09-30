# BROWSER_BUG_REPORT_253 — R304 yer-imi içe aktarma bozuk-veri matrisi

| Öğe | Değer |
|-----|-------|
| Dal | devin/1790740926-bookmark-import |
| Kod commit | 1a69278 |
| Yeni test | tests/browser-places-import-matrix.test.js (6194 kontrol) |

## Gerçek bulgular (2)
1. **`;jsessionid=` sızıntısı (security):** Java servlet oturum kimliği ve
   PHP/ASP eşleri (`PHPSESSID`, `ASPSESSIONID`, `ASP.NET_SessionId`,
   `sessionid`) hassas-parametre sözlüğünde değildi. İçe/dışa aktarılan yer
   imleri ve geçmiş kayıtları canlı oturum kimliğini kalıcı depoya
   yazıyordu. `SENSITIVE_KEY_NAMES`'e eklendi — sorgu ve path-matrix
   yüzeylerinde artık siliniyor.
2. **visitedAt ±Infinity/negatif:** normalizeBrowserPlaces'ta
   `Number(x) || Date.now()` sonlu olmayan ve negatif damgaları geçiriyordu.
   Infinity JSON'a `null` yazılır (depo şişmesi + sıralama bozulması),
   negatif damgalar frecency hesabını saptırır. Sonlu pozitif kapısı eklendi.

## Matris kapsamı
kök tip bozukluğu (null/dizi/ilkel) · koleksiyon tip bozukluğu · URL şema
matrisi (javascript/data/file/ftp/chrome/vbscript/mailto reddi) · kimlik
bilgili URL temizliği · hassas sorgu/path/fragment silimi · route/zaman
çapası korunması · 8192 sınırı · alan kelepçeleri (240/64/1–100000) ·
kapasite kesimi (100/20) · prototip kirliliği (`__proto__` kendi+vm realm)
· workspace fallback kuralları · alt normalizasyonlar · cloneBrowserPlaces
derin kopya · 500-tur tohumlu fuzz (asla fırlatmaz, invariant'lar korunur).
