# Rapor 572 — Üretim öncesi güncel grup planı

P05, 25 Ekim 2026. Başlangıç `3ac98ae9b1038717c6a107fee3e7e9d554e233f3`; ürün bitiş `95f3a01ed984cd7f1e704be37cb88b5e00133fe8`. Dal `codex/book-reliability549`, PR487.

## Kullanım

Bölüm düzenleyicisindeki **Konuşma gruplarını önizle → Güncel planı hazırla**, kaydedilmemiş taslak dahil güncel metni üretimle aynı chapterSrt/gruplama yolundan geçirir. Python `dub_plan.py` gerçekten çağrılır; model/GPU yüklenmez. Yeni gruplar, önceki sesle aynı metinli gruplar ve tam eşleşmeyen eski gruplar görünür. Karşılaştırma eski sıra/key üzerinden yapılmaz; boşluk düzeni dışında metin korunarak ve tekrar sayısı gözetilerek eşleştirilir. Örneğin 1.5 ile 15 aynı sayılmaz. Sayılar önbellek isabeti veya hız garantisi değildir; UI bunu açıklar.

Önizleme kitap metnini kaydetmez, activeJob/pending oluşturmaz ve ses üretmez. Yalnız içerik kimlikli geçici girdi SRT'si üretir ve mevcut dosya yetkilendirmesini kullanır. Sahte ses süresi göstermez: plan SRT'sinin pencereleri gerçek üretilmiş ses süresi değildir.

## Kaynak/üretim sözleşmesi

Yeni `book-plan-source`, sınırlı metin için textHash/sourceHash/grouping ve önceki grupları döndürür. Renderer gerçek planın sourceHash değerini bununla karşılaştırır. Sonuç yalnız güncel bölüm/diyalog/taslak için kabul edilir. Metin düzenlenince eski gruplar ve saklanan önizleme geçersiz olur. Son 30 metin snapshot'ı tutulur; yalnız aynı metne ait token üretim isteğine eklenir.

`book-prepare` opsiyonel preview token'ını kaydedilmiş güncel metin ve yeniden hesaplanan SRT hash/gruplamasıyla doğrular; uyuşmazlık iş kaydı oluşturmadan reddedilir. Önceki grup numaraları yeni metnin forceGroups alanına taşınmaz; mevcut değişmiş-metinde yeniden planlama politikası korunur. Bu önizleme isteğe bağlıdır; önizleme yapılmamış bölümler eski normal üretim yolunu kullanır.

## Dosyalar

- `src/book-production-plan.js`: metin ve tekrar sayısına göre güvenli karşılaştırma, plan sınır/anahtar doğrulaması.
- `src/media-workflows.js`: salt plan girdisi IPC ve üretim snapshot kontrolü.
- `src/renderer/book-production-plan-ui.js`: EN/TR panel, gerçek plan çağrısı, bayat sonuç engeli ve sınırlı token saklama.
- `src/renderer/index.html`, `media-workflows-ui.js`, `media-workflows.css`: CSP uyumlu yerel modüller, üretim token aktarımı ve tema paneli.
- `tests/book-production-plan.test.js`, `book-regenerate-request.test.js`, `electron-book-reliability.smoke.js`: gerçek Python/hizmet sözleşmesi, üretim token aktarımı ve native UI.

## Kanıt ve sınırlar

15 hedefli PASS: book-production-plan, book-regenerate-request, book-voice-takes, book-bookmarks, book-export, csp-policy. Plan testi gerçek Python/dub_plan.py kullanır; preview öncesi/sonrası project.json byte eşitliği, kaydedilmemiş/eskimiş plan reddi, güncel plan kabulü doğrulanır. Syntax/diff temiz.

Native Windows ayrı profil `.uiprev/book-reliability549-1792922099611`, exit0: gerçek renderer/preload/Python üzerinden altı gruplu taslak planı, kayıt/iş oluşturmama, düzenlemede eski grupları/token'ı kaldırma; mevcut kitap/PDF/EPUB/M4B/yer imi/deneme akışları. Görüntü incelendi. Kurulu motorun Python yorumlayıcısı yalnız model yüklemeyen plan için kullanıldı; harici motor dosyaları değiştirilmedi.

Gerçek ses üretimi/GPU/model kalitesi, ücretli/canlı API, kişisel start.bat, tam paket/CI bu turda denenmedi. Yeni bağımlılık/kurulum/kalıcı şema yok; opsiyonel IPC alanları ve normal içerik kimlikli girdi SRT'si. P05 tamam; P06–P10 açık. Master merge yok.
