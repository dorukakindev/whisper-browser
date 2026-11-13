# Whisper Browser tasarım altyapısı

## Estetik kararlar

Güncel yetki [DESIGN.md](../DESIGN.md) içindedir. Sabit amber/sarı birincil düğme, grafit zemin, tek vurgu, font, 4px boşluk ölçeği veya köşe biçimi zorunlu değildir. Minimalizm/sakinlik ve gradyan, parıltı veya dekoratif hareket yasağı kaldırılmıştır. Tasarımcı kompozisyonu içeriğe ve kullanım akışına göre geliştirebilir.

## Tema ve ortak roller

`uiTheme` (`system`, `dark`, `light`) kalıcı tema seçimidir; `html[data-theme]` etkin temayı taşır. Mevcut `--bg-*`, `--text-*`, `--border-*`, `--accent*`, `--radius-*`, `--space-*` rolleri uyumluluk altyapısıdır; değerleri değişebilir ve yeni semantik roller eklenebilir. Birden fazla vurgu rengi kullanılabilir. Ortak rolü kullanan yüzeyler birlikte kontrol edilir; rastgele kopyalanan sabit değerler yerine anlamlı ortaklaştırma tercih edilir.

## Korunacak davranış ve erişilebilirlik

- Normal metin ve kontrol etiketlerinde en az 4.5:1 kontrast korunur. Vurgu üstündeki metin seçilen gerçek arka planla birlikte değerlendirilir; herhangi bir renk adı zorunlu değildir.
- Kapatma/silme ve ana işlemler keşfedilebilir; klavye odağı görünürdür. Tek erişim yolu hover olmaz.
- Koyu/açık tema, azaltılmış hareket tercihi, dar alanda erişilebilir kontroller ve kullanıcıya ait açık/kapalı ayar tercihi korunur. Ayarların varsayılan olarak gizlenmesi estetik şart değildir.
- İleri özellikler, kaynak/zaman/iş sahipliği ve güvenlik tasarım uğruna kaldırılmaz.

## Doğrulama

Değişen davranışa uygun kısa test, syntax/diff ve ilgili gerçek render kontrolü yapılır. Testler belirli bir hex, doygunluk, font, boşluk veya düğme biçimini estetik şartname olarak dondurmaz. Mevcut görsel test araçları tanılama için kullanılabilir; her değişiklikte geniş matris veya tüm test paketi zorunlu değildir. Görülmeyen sonuç başarılı sayılmaz.
