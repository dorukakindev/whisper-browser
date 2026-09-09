# Whisper Local tasarım sistemi

Arayüz, yoğun altyazı iş akışını sakin tutan bir ses çalışma masasıdır. Koyu grafit ve
mürekkep yüzeyler ana kimliği oluşturur; sıcak amber yalnız birincil eylem, aktif konum
ve işlem durumu için kullanılır. Açık tema aynı hiyerarşiyi sıcak kâğıt tonlarıyla korur.

## Tema ve renk

Tema seçimi `uiTheme` (`system`, `dark`, `light`) olarak ayarlarda saklanır.
Renderer, seçimi `html[data-theme="dark|light"]` özniteliğine çözer. Yeni bileşenler
doğrudan koyu/açık hex yazmak yerine şu semantik tokenları kullanır:

| Amaç | Token |
|---|---|
| Ana tuval ve iç yüzeyler | `--bg-0`, `--bg-1`, `--bg-2`, `--bg-3` |
| Sınırlar | `--border`, `--border-strong` |
| Metin hiyerarşisi | `--text`, `--text-dim`, `--text-muted` |
| Birincil vurgu | `--accent`, `--accent-hover`, `--accent-soft`, `--accent-dim` |
| Amber üstündeki metin | `--accent-contrast` |
| Durumlar | `--success`, `--warning`, `--danger`, `--info` |

Amber dekorasyon değildir. Dolgu olarak kullanıldığında metin rengi mutlaka
`--accent-contrast` olmalıdır. Bağlantılar `--accent-hover` ile başlar; hover ve görünür
odak durumları korunur. Normal metin ve etkileşimli kontrol etiketleri WCAG 2.1 AA
eşiği olan 4.5:1'in altına düşmemelidir.

## Ölçü ve köşe

Boşluk ölçeği 4px tabanlıdır: `--space-1` (4px) ile `--space-6` (24px).
Yeni ve dokunulan kurallarda gelişigüzel ara değer yerine bu ölçek kullanılır.

| Kullanım | Token |
|---|---|
| Küçük kontrol/çip | `--radius-xs` |
| Girdi ve küçük yüzey | `--radius-sm` |
| Kart | `--radius` |
| Modal ve büyük panel | `--radius-lg` |
| Rozet ve kapsül | `--radius-pill` |

## Bileşen kuralları

- Birincil düğme amber dolgulu, ikincil düğme nötr yüzeyli, yıkıcı eylem kırmızı
  durum rengindedir.
- Mikro etiketler en az 10px ve `--text-muted` ya da daha güçlü bir tondadır.
- Kapatma ve silme kontrolleri dinlenme hâlinde de görünür olmalı; yalnız hover'a
  güvenilmez.
- Yeni seçici önce etkin tasarım bölgesine eklenir. Aynı seçicinin dosyanın eski ve
  etkin bölgelerinde tekrar tanımlanması yasaktır.
- Ana çalışma alanında sık değişmeyen temel ayarlar kapalı bir açıklama satırında
  başlar; model, dil ve çıktı özeti kapalıyken de görünür. Kullanıcının açık/kapalı
  tercihi güvenli `ui` ayarlarıyla korunur.
- Dekoratif emoji, gradyan, neon/parıltı ve işlevsiz animasyon eklenmez.
- `prefers-reduced-motion`, klavye odağı ve dar ekran davranışı korunur.

## Doğrulama

Değişiklikten sonra `node --check src/renderer/renderer.js`, ilgili tasarım sistemi testi,
tam `npm test` ve iki temada gerçek render kontrolü çalıştırılır. Ana çalışma masası
980px ve 560px; oynatıcı 860px kırılma noktalarında ayrıca kontrol edilir. Temel ayar
katmanı `tests/manual/theme-preview.js` ile kapalı ve açık durumda ayrıca görüntülenir.
