# Whisper Local UI Tasarım Sistemi

Sürüm: 1.1
Kaynak: `src/renderer/styles.css` ve oynatıcı arayüzü
Taşınabilir tema: `design-system/whisper-local-theme.css`

Bu doküman Whisper Local'in görünüşünü birebir bir ekran kopyası olarak değil,
başka masaüstü ve web uygulamalarına taşınabilen bir görsel dil olarak tanımlar.
İş mantığı, Electron IPC kodu, Whisper özellikleri ve uygulamaya özel metinler bu
sistemin parçası değildir.

## 1. Tasarım karakteri

Whisper Local bir medya ve üretim aracı gibi görünmelidir: ciddi, karanlık,
yoğun bilgiyi taşıyabilen ve uzun süre bakıldığında yormayan. Görsel hiyerarşi
dekorla değil yüzey, sınır, boşluk ve tipografiyle kurulur.

Temel ilkeler:

- Mürekkep siyahı zemin, grafit yüzeyler ve ince soğuk sınırlar kullan.
- Sıcak amber yalnızca ana eylem, aktif durum ve odak göstergesi olsun.
- Çeviri veya ikincil veri için soğuk camgöbeği kullan.
- Aynı ekranda yalnızca bir eylem görsel olarak baskın olsun.
- Emoji kullanma. Anlamlı, tek renkli SVG ikon kullan.
- Tarayıcı veya işletim sistemi varsayılan form görünümünü bırakma.
- Büyük parlak beyaz kutular, yoğun parıltı ve rastgele gradyan kullanma.
- Bilgi yoğunluğunu kartları çoğaltarak değil bölümleri gruplayarak yönet.

## 2. Başlangıç

Tema dosyasını yeni projeye kopyala ve uygulama köküne `wl-theme` sınıfını ekle:

```html
<link rel="stylesheet" href="whisper-local-theme.css">

<div class="wl-theme wl-shell">
  <!-- uygulama -->
</div>
```

React örneği:

```jsx
export function App() {
  return <div className="wl-theme wl-shell">...</div>;
}
```

Tema `.wl-theme` altında kapsamlanmıştır. Bu nedenle başka bir uygulamanın
mevcut CSS'iyle çakışmadan kademeli olarak uygulanabilir.

## 3. Tasarım token'ları

Başka programa taşırken renkleri bileşenlerin içinde tek tek değiştirme. Yalnızca
`.wl-theme` içindeki token'ları değiştir.

### Yüzeyler

| Token | Değer | Kullanım |
|---|---:|---|
| `--wl-bg-canvas` | `#090b0e` | Uygulamanın en arka zemini |
| `--wl-bg-base` | `#0a0c0f` | Ana çalışma zemini |
| `--wl-bg-subtle` | `#101419` | Sessiz bölümler |
| `--wl-bg-surface` | `#151b22` | Kart ve panel yüzeyi |
| `--wl-bg-raised` | `#1c242c` | Hover ve yükseltilmiş kontrol |
| `--wl-bg-input` | `#10161b` | Input, select ve textarea |

### Metin ve sınırlar

| Token | Değer | Kullanım |
|---|---:|---|
| `--wl-text` | `#edf1f3` | Birincil metin |
| `--wl-text-secondary` | `#a1adb7` | Etiket ve ikincil bilgi |
| `--wl-text-muted` | `#84929c` | Yardımcı bilgi, boş durum; grafit yüzeyde AA kontrastı |
| `--wl-border` | `#27313b` | Kart sınırı |
| `--wl-border-control` | `#2b3741` | Form kontrolü sınırı |
| `--wl-border-strong` | `#3a4652` | Hover ve yüksek ayrım |

### Anlam renkleri

| Token | Değer | Kullanım |
|---|---:|---|
| `--wl-accent` | `#d5a35c` | Ana eylem, aktif sekme, odak |
| `--wl-accent-hover` | `#efbd73` | Ana eylem hover |
| `--wl-translation` | `#8fc5c2` | Çeviri ve ikincil dil |
| `--wl-success` | `#69b58b` | Başarı |
| `--wl-danger` | `#d06b63` | Hata ve yıkıcı eylem |
| `--wl-warning` | `#d2a064` | Uyarı |
| `--wl-info` | `#83b8c8` | Bilgilendirme |

Amber bir dekor rengi değildir. Bir ekranda çok sayıda amber öğe varsa
hiyerarşi bozulmuştur.

## 4. Tipografi

Varsayılan aile:

```css
Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif
```

Inter uygulamayla paketlenmiyorsa sistem yazı tipine düşmek kabul edilir.
Harici CDN zorunlu değildir.

| Rol | Boyut | Ağırlık | Not |
|---|---:|---:|---|
| Uygulama başlığı | 17–22 px | 650–700 | Kısa ve tek satır |
| Kart bölüm başlığı | 12 px | 700 | Büyük harf, `0.12em` harf aralığı |
| Normal metin | 14 px | 400–500 | `1.5` satır yüksekliği |
| Buton | 12–13 px | 650 | Tek satır |
| Form etiketi | 11 px | 600 | İkincil renk |
| Yardım metni | 11 px | 400 | Birincil metin yerine geçmemeli |
| Zaman/kod/veri | 12–13 px | 400–600 | Tabular veya monospace |

Uzun açıklamalarda tamamı büyük harf kullanılmaz. Büyük harf yalnız kısa bölüm
etiketlerinde kullanılır.

## 5. Boşluk ve şekil

Boşluk ölçeği 4, 8, 12, 16, 20 ve 24 pikseldir. Yeni bir değer gerekmedikçe bu
ölçeğin dışına çıkma.

| Öğe | Önerilen değer |
|---|---:|
| Küçük kontrol yarıçapı | 7 px |
| Input/buton yarıçapı | 9 px |
| Kart yarıçapı | 14 px |
| Kart iç boşluğu | 18 px |
| Mobil kart iç boşluğu | 14 px |
| Kontrol yüksekliği | 39 px |
| Ana eylem yüksekliği | 45 px |
| İkon düğmesi | 38 × 38 px |

Pill biçimi yalnız durum rozeti veya çok kısa filtre için kullanılır. Her butonu
pill yapmak arayüzü ucuzlaştırır.

## 6. Bileşenler

### 6.1 Kart

Sınıflar:

- `wl-card`: standart çalışma yüzeyi.
- `wl-card wl-card--quiet`: daha sessiz alt yüzey.
- `wl-card wl-card--accent`: aktif süreç veya önemli bölüm.

Kartları sırf boşluk oluşturmak için iç içe koyma. Aynı iş akışına ait alanları
tek kartta bölüm başlıklarıyla ayır.

```html
<section class="wl-card">
  <header class="wl-card-head">
    <h2 class="wl-section-title">Kaynak</h2>
  </header>
  ...
</section>
```

### 6.2 Buton

| Varyant | Sınıf | Kullanım |
|---|---|---|
| Primary | `wl-btn wl-btn--primary` | Ekranın tek ana eylemi |
| Secondary | `wl-btn wl-btn--secondary` | Destekleyici eylem |
| Ghost | `wl-btn wl-btn--ghost` | Düşük öncelikli araç |
| Danger | `wl-btn wl-btn--danger` | Silme veya geri döndürülemez işlem |
| Icon | `wl-icon-btn` | Yerleşik ve bilinen kısa araç |

Buton yüklenirken genişliği değişmemeli. Etiket değişecekse minimum genişlik
korunmalı ve mümkünse yanında ilerleme göstergesi kullanılmalıdır.

```html
<button class="wl-btn wl-btn--primary" type="button">İşlemi başlat</button>
<button class="wl-icon-btn" type="button" aria-label="Ayarları aç">
  <!-- inline SVG -->
</button>
```

Durumlar:

- Hover: yüzey ve sınır belirginleşir; en fazla 1 px yükselir.
- Active: 1 px aşağı iner, çok hafif küçülür.
- Disabled: opaklık azalır ve işlem almaz.
- Loading: devre dışıdır; `aria-busy="true"` kullanılır.
- Focus: amber odak halkası görünür.

### 6.3 Form alanı

```html
<label class="wl-field">
  <span class="wl-label">Dosya adı</span>
  <input class="wl-input" type="text" placeholder="Bir değer gir">
  <small class="wl-help">Kısa ve yararlı açıklama.</small>
</label>
```

Hata durumunda input'a `aria-invalid="true"`, açıklamaya benzersiz bir `id`,
input'a da `aria-describedby` eklenir. Placeholder hiçbir zaman kalıcı etiketin
yerine kullanılmaz.

### 6.4 Sekme

Sekmeler aynı bağlam içindeki görünümü değiştirir; işlem başlatmaz.

```html
<div class="wl-tabs" role="tablist" aria-label="Kaynak türü">
  <button class="wl-tab" role="tab" aria-selected="true">Dosya</button>
  <button class="wl-tab" role="tab" aria-selected="false">YouTube</button>
</div>
```

Klavye davranışı: sol/sağ ok sekmeler arasında hareket eder, `Home` ve `End`
ilk/son sekmeye gider.

### 6.5 Switch

Switch yalnız anında uygulanan açık/kapalı tercihi için kullanılır. Formu
gönderen normal bir onay kutusunu switch gibi göstermeyin.

```html
<label class="wl-switch">
  <input type="checkbox">
  <span>
    <strong>Otomatik devam</strong>
    <small>İş bittiğinde sıradakine geçer.</small>
  </span>
</label>
```

### 6.6 Durum rozeti

`wl-status`, `wl-status--active`, `wl-status--success` ve
`wl-status--danger` sınıfları kullanılır. Renk tek başına anlam taşımamalı;
durum metni veya erişilebilir etiket bulunmalıdır.

### 6.7 Liste ve aktif satır

Yoğun veri listelerinde her satır yeni bir kart olmaz. `wl-list` içinde
`wl-list-row` kullanılır. Aktif satır `aria-current="true"` ile belirtilir.
Çeviri metni `wl-translation` rengini kullanabilir.

### 6.8 Dialog ve drawer

Dialog kısa, odaklı ve ekranı bloke eden kararlar içindir. Ayar veya uzun içerik
drawer/panel içinde kalmalıdır.

Dialog açıldığında:

- Odak dialog içindeki ilk anlamlı kontrole gider.
- `Tab` dialog dışına çıkmaz.
- `Escape` güvenliyse kapatır.
- Kapanınca odak dialogu açan kontrole döner.
- Arka plan `aria-hidden` veya `inert` olur.

### 6.9 Signal Desk

Ana üretim ekranının ayırt edici bileşeni `Signal Desk`tir. Üç parçanın aynı
iş bağlamını farklı zaman ölçeklerinde göstermesini sağlar:

- `İş özeti`: kaynağı, model/motoru, çıktıyı, dil katmanını ve VRAM bütçesini
  başlatmadan önce tek bakışta gösterir.
- `Profil farkı`: seçili ayarların son temel profilden hangi alanlarda ayrıldığını
  sayar; “Özel” etiketiyle farkın içeriğini saklamaz.
- `Sinyal zinciri`: Kaynak → Ses → Model → Metin → Dil → Sesler → Çıktı
  aşamalarını ad ve durumla gösterir; renk tek başına anlam taşımaz.

Signal Desk yeni bir parlak kart ailesi değildir. Mevcut grafit yüzeyi, tek
amber sinyal çizgisini ve yoğun tipografi ritmini kullanır.

Canlı önizleme satırları da aynı ilkeyi izler. Aktif, düşük güvenli,
düzenlenmiş ve çevirisi bulunan satırlar yalnız renkle değil; sol durum
kanalındaki ayrı geometriler ve ekran okuyucu durum metniyle ayrılır. Çeviri,
kaynak satırın altında adı yazılı ikincil bir satırdır; ayrı bir kart üretmez.

### 6.10 İşler merkezi ve sonuç masası

Kuyruk, geçmiş ve elle kontrol kayıtları ayrı kartlar yerine `İşler` yüzeyinin
eş sekmeleridir. Her panel kendi boş durumuna sahiptir ve sekmeler sol/sağ ok,
Home ve End ile çalışır. Kalite raporu sonuç dialogunda hızlı okuma, çakışma,
uzun blok ve en yüksek KPS değerlerini ayrı hücrelerde gösterir; sorun varsa
`Elle kontrol` metni görünür.

### 6.11 Form ve açılır liste sahipliği

Electron/Windows sürümünde tek seçim kontrollerinin tetikleyicisi tema tokenlarıyla
uygulamaya aittir; açılan seçenek listesi Windows/Chromium'un yerel `<select>`
popup'ıdır. Popup geometrisinin platforma ait olması bilinçli kabul edilir.
Uygulama gelecekte popup genişliği, çarpışma veya seçenek çizimini sahiplenirse
tek bir ortak erişilebilir listbox primitive'i kurulur; ekran bazlı özel select
yapılmaz.

Arama alanları doluyken uygulamaya ait temizleme düğmesi gösterir. İş başlatma
doğrulaması yalnız günlüğe yazılmaz: görünür hata özeti, `aria-invalid`, bağlı
açıklama ve ilk sorunlu alana odak yolu sağlar.

## 7. İkonlar

- Emoji kullanma.
- Inline SVG veya uygulamayla paketlenmiş tek bir ikon seti kullan.
- Önerilen geometri: 18 veya 20 px, `1.8` stroke, yuvarlak uçlar.
- Dekoratif ikonlarda `aria-hidden="true"` kullan.
- Yalnız ikonlu düğmelerde görünür tooltip ve `aria-label` zorunludur.
- Aynı eylem için farklı ekranlarda farklı ikon kullanma.
- Unicode üçgen/dişli/çarpı karakterlerini ikon yerine kullanma.

## 8. Yerleşim ve responsive davranış

Masaüstü çalışma ekranı iki sütunludur:

- Sol: kaynak, ayarlar ve eylemler.
- Sağ: ilerleme, canlı önizleme ve günlük.
- Her sütun en az 360–420 px genişlik almalıdır.
- 980 px altında tek sütuna geçilir.
- 560 px altında kart başlıkları ve araç çubukları dikey dizilir.

Bir panel kullanıcı tarafından yeniden boyutlandırılabiliyorsa yalnız pencere
media query'lerine güvenme. Panel içeriği için container query kullan.

Sabit alt eylem çubuğu içerikle çakışmamalı; kaydırma alanında yeterli alt
boşluk bırakılmalıdır.

## 9. Hareket

- Hover ve kontrol geçişi: 120 ms.
- Panel veya drawer: 180–220 ms.
- Progress değişimi: 180 ms.
- Büyük zıplama, sürekli parıltı ve dekoratif döngü kullanma.
- `prefers-reduced-motion: reduce` desteklenmelidir.
- Yerleşim türü değişen CSS grid sütunlarını interpolate etmeye çalışma; modu
  anında değiştir veya yalnız opacity/transform kullan.

## 10. Erişilebilirlik kontrol listesi

- Bütün etkileşimli öğeler klavyeyle erişilebilir.
- Focus halkası kaldırılmaz.
- Metin kontrastı WCAG AA seviyesini hedefler.
- İkon düğmesinde `aria-label` vardır.
- Sekmeler `role="tablist"`, `role="tab"` ve `aria-selected` kullanır.
- Toggle düğmeleri `aria-pressed`; açılır kontroller `aria-expanded` kullanır.
- Hata yalnız kırmızı sınırla anlatılmaz; metin açıklaması bulunur.
- Yüklenen işlem `aria-busy` veya canlı durum metniyle bildirilir.
- Minimum hedef alanı 36 × 36 px, tercihen 40 × 40 px'tir.
- Hareket azaltma tercihi desteklenir.

## 11. Başka teknolojiye eşleme

| Hedef | Uygulama yöntemi |
|---|---|
| Electron / düz HTML | Tema dosyasını doğrudan kullan; davranışı mevcut JS'e bağla |
| React | `wl-*` sınıflarını küçük bileşenlere sar; token'ları global CSS'te tut |
| Vue / Svelte | Scoped component CSS yerine ortak token dosyasını kökte yükle |
| PySide / Qt | Token tablosunu QSS değişkenlerine/şablonuna çevir; durumları Qt property ile yönet |
| Tkinter / CustomTkinter | Renk ve ölçü token'larını Python sabitlerine dönüştür; birebir CSS bekleme |
| .NET / WPF | Token'ları ResourceDictionary içindeki Brush/Thickness değerlerine aktar |

Yeni teknolojide önce token ve temel kontrolleri taşı. Sonra ekran yerleşimini
uyarla. Whisper Local'in HTML yapısını farklı bir framework'e olduğu gibi
kopyalamak gerekli değildir.

## 12. Portlama sırası

1. Yeni programdaki bütün ekranları ve çalışan kontrolleri listele.
2. Mevcut davranışları değiştirmeden token'ları ekle.
3. Input, select, buton, ikon düğmesi ve switch'i dönüştür.
4. Kart ve panel hiyerarşisini kur.
5. Header ve ana yerleşimi dönüştür.
6. Loading, empty, error, disabled ve focus durumlarını tamamla.
7. 1440 px, 1024 px, 800 px ve 560 px genişliklerde kontrol et.
8. Her düğmenin önce/sonra durumunu işlevsel olarak test et.

## 13. Başka bir agente verilecek hazır talimat

```text
Bu programın mevcut işlevlerini ve ekran akışını koruyarak arayüzünü yeniden
tasarla. Görsel kaynak olarak UI-DESIGN-SYSTEM.md ve
design-system/whisper-local-theme.css dosyalarını kullan.

Kurallar:
- İş mantığını, veri akışını ve çalışan özellikleri silme.
- Emoji ve Unicode karakter ikonları kullanma; erişilebilir SVG ikon kullan.
- Koyu mürekkep/grafit yüzeyleri, amber ana eylemi ve camgöbeği ikincil veri
  rengini koru.
- İşletim sistemi veya tarayıcı varsayılan input/select/slider görünümü bırakma.
- Bir ekranda yalnızca bir primary eylem kullan.
- Dar ve geniş pencere düzenlerini uygula.
- Loading, empty, error, disabled, hover ve focus durumlarını tamamla.
- Önce mevcut kontrollerin envanterini çıkar. Uygulamadan sonra bütün düğmeleri
  ve responsive kırılımları test et.
- Referans programdan iş mantığı kopyalama; yalnız tasarım sistemini taşı.
```

## 14. Yapılmaması gerekenler

- Her şeyi amber renge boyamak.
- Ana eylemle aynı ağırlıkta çok sayıda buton göstermek.
- Düz beyaz input veya sistem mavisi slider bırakmak.
- Kart içinde gereksiz kartlar üretmek.
- Küçük ekranda kontrolleri yalnızca sıkıştırmak; gerektiğinde yeniden dizmek.
- Hover durumunu tek etkileşim göstergesi yapmak.
- Metin yerine belirsiz ikonlar kullanmak.
- Tasarım uğruna çalışan kontrolü veya kullanıcı ayarını kaldırmak.

## 15. Sürümleme

Tema başka projelerde kullanılmaya başladığında dosyayı kopyalayıp projeye göre
sessizce değiştirmek yerine sürüm numarasıyla takip et:

- Patch: renk düzeltmesi veya küçük erişilebilirlik iyileştirmesi.
- Minor: geriye uyumlu yeni bileşen veya varyant.
- Major: token adı veya HTML sınıfı değiştiren kırıcı güncelleme.

### Token sahipliği

Bu olgun Electron uygulamasında çalışan `src/renderer/styles.css` semantik
tokenların kanonik sahibidir (Model B). `design-system/whisper-local-theme.css`
taşınabilir `--wl-*` eşlemesidir; `UI-DESIGN-SYSTEM.md` değerleri ve kullanım
gerekçesini belgeler. Global token değişikliği bu üç katmanda aynı değişiklikte
izlenir; bileşenlerde yeni ham renk kopyaları üretilmez.

Projeye özel renk veya ölçü farklılıkları `whisper-local-theme.css` dosyasını
değiştirmek yerine tema dosyasından sonra yüklenen küçük bir override dosyasında
tutulmalıdır.
