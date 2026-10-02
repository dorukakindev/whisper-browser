# BROWSER_BUG_REPORT_396 — Windows elle doğrulama: master `c8ed7e7` (kuyruk-50 #422–436 sonrası)

Tarih: 2026-10-02 (UTC). Repo: `dorukakindev/whisper-browser`. Doğrulama tabanı: `master` `c8ed7e7e4b0a39465902f5293eafe2806f2d2762` (önceki doğrulanan `dcfe1ce`'den 15 commit ileri; PR #422–436). Dal: `codex/windows-manual-check-2026-10-02` (master içeriği, temiz).

Yöntem: gerçek Windows üzerinde `start.bat` → DRM `choice` sorusuna `h` → Electron penceresi. Kod değiştirilmedi; yalnız elle UI doğrulaması + ekran görüntüsü + kayıt. Kanıt dosyaları doğrulama makinesinde `verify-r236\shots\w396-*.png` ve `screencasts\rec-w396-edited.mp4` altında (repo dışı).

## Özet

| Alan | Sonuç |
|------|-------|
| `start.bat` normal açılış | **GEÇTİ** |
| NTP imleç davranışı (`#browserEmpty`) | **KALDI** — pointer'a hâlâ ölü |
| Reklam koruması site-tercihi (tur-3 §1–6) | **GEÇTİ** (6/6) |
| NTP frecency kutucukları (tur-3 §7–11) | **KISMİ** — render doğru, etkileşim pointer-ölü |
| Sekme önizleme kartı (kompakt varyant) | **GEÇTİ** |
| PDF açma akışı (tur-3 §20–24) + #429 yüzeyleri | **GEÇTİ** |

## 1. `start.bat` normal açılış — GEÇTİ

- `start.bat` → `h`: Electron penceresi açıldı, Local subtitle workspace render oldu; konsol normal boot (whisper ready, CUDA→CPU fallback, GPU yok) — ölümcül hata yok.
- cuDNN/cuBLAS/torch-lib/`backend\bin` PATH eklemeleri `start.bat:13-20` aralığında `if exist` koşullu; CPU'lu kutuda eksik nvidia dizinleri zararsız atlanıyor.

## 2. NTP imleç davranışı — KALDI (üçüncü turda da FAIL)

- Boş sekmede (`#browserEmpty`): arama kutusuna tık+yazma metin girmiyor; NPR kutucuğu tıklanmıyor; "İzlemeye devam et" kartı tıklanmıyor. Klavye (Tab+Enter) çalışıyor; site çipi, ayarlar ve gerçek web sayfası sekmeleri pointer'a yanıt veriyor — yani ölü bölge boş-sekme durumuna özgü.
- Beklenen: hover+tık çalışmalı. Gözlenen: tüm NTP yüzeyi ölü. Şüpheli yol değişmedi: `src/main.js:13259` civarı `ensureBrowserView` içinde `view.setVisible(false)` + `addChildView(view)` — ekran-dışı taşıma yok; gizli WebContentsView boş-sekme slot'unun üstünde kalıyor. `hideBrowserViewOffscreen` kapsamı bu yolu kapsamıyor; benzer `setVisible(false)`+`addChildView` çağrılarının tümü denetlenmeli.
- Tema/dil: açık tema, EN arayüz. Repro: `start.bat`→`h`→BROWSER→boş sekme→herhangi bir NTP öğesine tık.
- Kanıt: `w396-ntp-pointer-dead.png`, `w396-ntp-search-dead.png`.

## 3. Reklam koruması site-tercihi (tur-3 §1–6) — GEÇTİ (6/6)

- §1–2: `bbc.com` site çipi → "Ad protection on this site". Tık → sayfa yenilendi, önceden engellenen reklam bandı belirdi, çip "Site profile" oldu. Tooltip: "Ad protection on for this site · Turn off (www.bbc.com)".
- §3: NPR'de çip "Default profile" + koruma açık — bbc override'ı sızdırmadı; site-bazlı kapsam doğru.
- §4: bbc'de koruma tekrar açılınca override kalktı; Site profili satırı **"Inherit" + "Varsayılan izliyor: Açık"** gösteriyor (alan silinmiş, `true` yazılmamış).
- §5: Settings→Privacy→genel anahtar kapatılınca çip "Ad protection" (tüm-sitelerde-kapalı metni); tık genel ayarı açtı + reload.
- §6: boş sekmede çip genel anahtar gibi davranıyor.
- Kanıt: `w396-bbc-ad-off-banner.png`, `w396-npr-default-profile.png`, `w396-adprotect-inherit.png`, `w396-adprotect-on-tooltip.png`, `w396-emptytab-global-switch.png`.

## 4. NTP frecency kutucukları (tur-3 §7–11) — KISMİ

- Render doğru: "İzlemeye devam et" kartları ilerleme çubuğu + "59:44 left" metniyle görünüyor; QUICK ACCESS kutucukları favicon/harf-avatar (Vikipedi "W" dahil) + × düğmeli.
- Etkileşim (hide/geri-getir, devam-kartı tık, açık-tema hover) pointer-ölü olduğundan doğrulanamadı → §8/9/11 otomatik kaldı (kök neden madde 2).
- Kanıt: `w396-ntp-render.png`.

## 5. Sekme önizleme kompakt varyantı — GEÇTİ

- Sekme üstüne ~1 sn hover → önizleme kartı (başlık + URL) krom alanı içinde tamamen render; alt kenar native sayfa yüzeyine taşmıyor/kırpılmıyor. Sınır zoom ile doğrulandı. (#178 düzeltmesi sağlam.)
- Kanıt: `w396-tab-preview.png`.

## 6. PDF açma akışı (tur-3 §20–24) + #429 regresyonu — GEÇTİ

- Açılış: ⋯→Open PDF→`book300.pdf` → okuyucu açıldı; #429'un **"Side by side" çift-görünümü artık varsayılan** (sol orijinal + sağ çeviri) ve yeni **"Select pages"** düğmesi çalışıyor — temel açış kırılmamış.
- §20: Esc/kapat → web sayfası hemen geri geldi.
- §21: ok tuşları + Space PDF kaydırdı, video oynamadı, Esc okuyucuyu kapattı.
- §23: sayfa kutusu 150→PAGE 150 (ve 10→10); yukarı kaydır 149→148 sıralı; %145 zoom sonrası geri kaydırma çalıştı.
- §24: `book300` %145'teyken `small10.pdf` açıldı → **%100** (zoom belge başına sıfırlanıyor).
- "Select pages" diyaloğu (aralık girişi, Failed/Untranslated kapsamı) sorunsuz açıldı.
- Kanıt: `w396-pdf-sidebyside.png`, `w396-pdf-page150.png`, `w396-pdf-backscroll149.png`, `w396-pdf-zoom145.png`, `w396-pdf-small10-100.png`, `w396-pdf-selectpages.png`.

### Minör gözlem (yeni)

- **PDF sayfa-atlama hedefi bir kez saptı:** sayfa kutusuna "200" yazınca PAGE 153'e indi (sonraki 150→150 ve 10→10 doğruydu). Çift-görünümün lazy-render ölçümü ilk atlamada geçici düşüyor olabilir. Deterministik değil; izlemeye değer küçük kusur.

## Ayrık notlar

- Oynatıcı/YouTube bu oturumda açılamadı (kutucuk tıkları scroll etti ama player başlamadı; `file://` render olmadı) — büyük olasılıkla madde 2 ile aynı view-cover ailesi; elle ayrıca denenmeli.
- Video oynatıcısına ulaşılamadığı için "Resume from:" çipi (tur-3 §28'in kalan parçası) ve oynatıcı-içi etkileşimler bu turda da doğrulanamadı.
- Önceki turdaki PDF çeviri-onay diyaloğu pointer-ölü bulgusu bu turda yeniden denenmedi (çeviri akışı kapsam dışı); NTP kök nedeniyle aynı aileden olma olasılığı yüksek.

## Sonuç

- GEÇTİ: açılış, reklam koruması (6/6), sekme önizleme, PDF okuyucu + #429 yüzeyleri.
- KALDI: NTP pointer-ölümü (üçüncü turda da; `main.js:13259` şüpheli yolu hâlâ ekran-dışı taşıma yapmıyor) ve ona bağlı NTP etkileşim maddeleri.
- Öneri: `ensureBrowserView` ve `setVisible(false)` çağıran tüm görünüm yollarının `hideBrowserViewOffscreen` kapsamına alınması; video oynatıcı açılışının aynı kök nedenle bozulup bozulmadığının elle kontrolü.
