# BROWSER_BUG_REPORT_221 — R269: odak/klavye tur-2 (dialog occlusion)

**Tarih:** 2026-09-30 · **Dal:** `fix/r269-dialog-occlusion` · **Bulgu: 1 bug**

## Bulgu — dinamik `<dialog>` native yüzeyin arkasında kalıyordu

**Sınıf:** UI görünürlük / occlusion
**Şiddet:** orta (kullanıcı diyalogu göremez, Esc'le kapatmak zorunda kalır)

`syncBrowserOcclusion()` yalnız `mediaCatalogDialog`'u açık diyalog sayıyordu.
Yeniden-çeviri fark incelemesi (`retranslate-review`) gibi `document.createElement('dialog')`
ile yaratılan diyaloglar occlusion hesabına girmiyordu: tarayıcı çalışma alanı
aktifken açılan diyalog, DOM'un üstünde duran WebContentsView'in **arkasında**
görünmez kalıyordu. Üstelik `showModal`/`close`/`cancel` hiçbirinde
`syncBrowserOcclusion()` çağrılmıyordu — açılışta gizlenme tetiklenmiyor,
kapanışta takılı gizli kalıyordu (bir sonraki keyfi resync'e dek).

Kanıt sınıfı zaten biliniyordu: katalog diyaloğu için explicit `?.open`
kontrolü ve `showModal` sonrası resync vardı — dinamik diyaloglar aynı
kapsamdan dışarıda bırakılmıştı.

## Düzeltme

- Occlusion hesabı `document.querySelector('dialog[open]')` ile **tüm** açık
  diyalogları kapsar (katalog satırı genelleşti).
- Retranslate diyaloğu: `showModal()` sonrası `syncBrowserOcclusion()`;
  `close()` ve `cancel` yollarında `remove()` sonrası resync.

## Doğrulanan yüzeyler (temiz)

- Yönetilen modallar (`resultModal`, `appDialog`): focus-trap (ilk/son öğe
  Tab sararı + boş listede `.modal-content` odağı), Esc → `resolveAppDialog`/
  `closeManagedModal`, inert arka plan, sıralı modal kuyruğu, odak iadesi — tamam.
- `mediaCatalogDialog`: `showModal`+resync ve `close` dinleyicisinde temizlik
  + `state.opener` odak iadesi — zaten doğruydu.
- Esc zinciri önceliği (`keydown` katman sözleşmesi): açık `dialog[open]`
  varken Esc diyaloğa ait — hem PDF okuyucu hem oynatıcı yolu doğru bekliyor.
- Menü/`details` Esc kapanışları ve odak iadesi (R233–R235 kilitleri) — bozulmadı.

## Yeni testler

`tests/browser-dialog-occlusion.test.js` (4 kontrol): occlusion ifadesinin
`dialog[open]` kapsaması, retranslate açılış resync'i, kapanış yollarının
resync'i, katalog `showModal`+`close` resync sözleşmesi.

## Windows etkisi

Diyalog görünürlüğü Windows'ta da aynı WebContentsView katmanına bağlı —
düzeltme platformdan bağımsız yararlı; ek risk yok.

## Doğrulanmayan sınırlar

- Gerçek tarayıcı yüzeyi açıkken diyalog açılışı (WebContentsView gerçek
  pencerede) — statik sözleşme + desen eşleşmesiyle kilitli; headless'te
  native view yok.
- Yeni dinamik diyalog eklenirse `showModal` sonrası resync çağrısı yine
  gerekir (dil-imleci kuralı notu).
