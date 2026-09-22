# SmartTube TV deneyimi — 2026-09-22

Taban: `fix/browser-translate-cosmetic-audit-2026-09-22` @ `dcbdb95` (önceki paket).

## Neden "doğrudan SmartTube" değil

- **SmartTube'u doğrudan gömmek:** SmartTube (github.com/yuliskov/SmartTube, MIT) bir Android TV uygulaması (Java/Kotlin). Electron içinde çalıştırılamaz. Fikirleri ve arayüz dili alındı, kodu değil.
- **SmartTube'un TV koduyla girişi:** Bu giriş YouTube'un kendi TV istemci kimlik bilgilerini kullanır. Aynı yaklaşım bu projeden `BROWSER_BUG_REPORT_94` ile bilerek kaldırılmıştı (başka uygulamanın OAuth istemcisi). Bu çalışma o sınırı korur.

## A — YouTube TV modu

YouTube'un kendi TV web uygulaması (`https://www.youtube.com/tv`) ayrı bir pencerede, bir TV tarayıcı kimliğiyle açılır.

- **Giriş:** YouTube'un kendi kod ekranıyla yapılır. TV ekranında bir kod görünür; bu kod telefonda `yt.be/activate` adresine girilir. Uygulama hiçbir OAuth istemci kimliği gömmez, token görmez ve saklamaz. Oturum yalnız `persist:youtube-tv` bölümündeki çerezlerde durur.
- **Yalıtım:**
  - Pencere sandbox'lıdır; preload köprüsü ve Node erişimi yoktur.
  - Üst düzey gezinme yalnız `youtube.com` ve Google hesap sayfalarında kalır; diğer bağlantılar sistem tarayıcısında açılır.
  - Açılır pencereler reddedilir.
  - İzin olarak yalnız tam ekran verilir; kamera, mikrofon, konum ve bildirim reddedilir.
  - İndirme yapılmaz.
- **Kısayollar:**
  - F11: tam ekran.
  - Ctrl+Shift+S: oynatılan videoyu uygulamanın tarayıcı çalışma alanında açar (`youtube.com/watch?v=…`). Altyazı yakalama ve çeviri araçları orada çalışır.
- **Uygulamadaki şerit:** Açık TV penceresini ve oynatılan videoyu gösterir. Düğmeler: "Altyazı araçlarında aç", "TV'ye dön", "Kapat".
- **TV kimliği:** Üç seçenek var: Android TV (Cobalt), Samsung Tizen ve LG webOS. YouTube bir kimliği reddedip masaüstü sitesine yönlendirirse şerit bunu söyler ve "Başka TV kimliği dene" düğmesini gösterir. Seçim kart görünümü panelinden de değiştirilebilir.
- **"TV oturumunu kapat":** Yalnız TV bölümünün çerez ve depolamasını siler.
- **Giriş penceresi:** En üstte "YouTube TV modunda giriş yap" düğmesi var (kurulum gerektirmez).

## B — SmartTube TV görünümü

Uygulamanın kendi SmartTube ızgarası için 10-foot düzen. Varsayılan olarak açıktır; üst çubuktaki TV simgesiyle kapatılabilir.

- **Palet:** Temadan bağımsız koyu TV paleti. Değerler `--st-tv-*` token'ları olarak tanımlı; açık temada da SmartTube gibi koyu kalır.
- **Kenar menü:** Yalnız simgelerden oluşur. Odaklanınca etiketlerle birlikte açılır.
- **Odaklı kart:** %6 büyür, 3 px beyaz çerçeve ve gölge alır. Bu sayede kumandayla uzaktan görülebilir.
- **Gezinme:**
  - Oklarla kartlar arasında dolaşılır.
  - En soldaki karttan ← kenar menüye geçer; kenar menüde → ilk karta döner.
  - Esc, Backspace veya kumandanın Geri tuşu aramadan çıkar, değilse kenar menüye döner.
  - F tuşu tam ekranı açıp kapatır.
- **Cihaz koduyla giriş (kendi OAuth istemcisiyle):**
  - Kod SmartTube'daki gibi büyük gösterilir (40 px).
  - QR 200 px'tir.
  - Kodun süresi geri sayılır; süre dolunca yeni kod üretilmesi gerektiği yazılır.

## Doğrulama

- `tests/youtube-tv-mode.test.js` — 7 test. Kapsam:
  - gezinme beyaz listesi ve kötü niyetli adresler,
  - video kimliği çıkarma,
  - pencere yalıtımı,
  - IPC yetki kontrolü,
  - OAuth istemci kimliği gömülmediği,
  - preload ve renderer bağlantıları,
  - TV paleti token'ları.
- Klavye gezinmesi başsız Chromium'da denendi: kenar menüde → ilk karta, en soldaki kartta ← kenar menüye geçiyor.
- `npm run audit:ui`: 0 kontrast hatası. TV paletinde açık temanın koyu vurgusu 2.5:1 kalıyordu; TV vurgusu ayrı bir token yapılarak düzeltildi.
- Mevcut testler: Node 251/260, Python 21/24. Kalan dosyalar bu ortamda eksik paketler yüzünden kalıyor (jsdom, mux.js, yt_dlp…); liste önceki paketle aynı.
- Ekran görüntüleri: `docs/devir/evidence/2026-09-22-smarttube-tv/`.

## Yerelde doğrulanmalı (bu ortamdan YouTube'a erişilemiyor)

1. TV modu açılınca YouTube'un TV arayüzü mü geliyor, yoksa masaüstü sitesine mi yönlendiriliyor? Yönlendiriliyorsa diğer TV kimliklerini deneyin.
2. TV ekranındaki kod ile `yt.be/activate` girişinin tamamlanması ve uygulama yeniden başlatıldığında oturumun korunması.
3. Ctrl+Shift+S ile devredilen videoda altyazı yakalamanın çalışması.
4. Kumanda veya klavyeyle uzun süreli gezinme ve tam ekran.

TV arayüzünün kendisi YouTube'a aittir. YouTube, TV kimliğiyle açılan masaüstü tarayıcılarına erişimi ileride kısıtlayabilir. Böyle bir durumda B (uygulamanın kendi görünümü) çalışmaya devam eder.
