# Araştırma probu — ürün entegrasyonu değildir

Proje kökünden çalıştır. Gerçek siteye az sayıda salt-okunur gezinme yapar; giriş bilgisi istemez, form göndermez ve challenge çözmez. Çıktılar ayrı `.uiprev` profilinde; Git'e koyma. C# programı bağımsız bir WebView2 pencere probudur, Electron içine yerleştirilmiş yeni browser değildir. Var olan kullanıcı profili veya uygulama ayarlarına dokunmaz.

Kaynakların bu kopyası haber sayfasını ölçer. Aynı probun önceki koşumunda URLdizisi `https://www.ancient-origins.net/` ve `https://www.ancient-origins.net/user/login` idi. Ana/giriş sayfası ölçümleri raporda ayrı kaydedildi.

```powershell
$env:DOTNET_GENERATE_ASPNET_CERTIFICATE='false'
$env:DOTNET_CLI_WORKLOAD_UPDATE_NOTIFY_DISABLE='true'
$env:DOTNET_CLI_TELEMETRY_OPTOUT='1'
$env:DOTNET_CLI_HOME=Join-Path (Get-Location) 'tmp/webview2-research/cli'
$env:NUGET_PACKAGES=Join-Path (Get-Location) 'tmp/webview2-research/packages'
# Bu kaynak dosyalarını önce tmp/webview2-research içine kopyala; obj/bin'i Git'e yazma.
dotnet build tmp/webview2-research/Probe.csproj -c Release --disable-build-servers
& tmp/webview2-research/bin/Release/net10.0-windows/Probe.exe .uiprev/ancient-webview2-recheck
$env:ELECTRON_RUN_AS_NODE=$null
& node_modules/electron/dist/electron.exe docs/raporlar/probes/webview2-20261024/electron-article.cjs
```

Gereksinimler bu araştırmada yerelde var olan .NET10SDK/WindowsDesktop runtime, Evergreen WebView2runtime ve NuGet'ten Microsoft.Web.WebView2 **1.0.4022.49**. SDKsürümü enyenidir iddiası yok; sabit sürüm resmî NuGet'ten alındı. İlk build .NETilk-kullanım aşamasında takıldı; yalnız doğrulanan taskPID durdurulup ilk-kullanım/telemetri kontrolleri kapalı yeniden derlendi. İlk .NETSDKçalışması güvenilmeyen ASP.NETgeliştirme sertifikası ürettiğini bildirdi; trust komutu çalıştırılmadı. Sonraki komutlar sertifika üretimini kapattı. İlk build kullanılmayan WebView2Wpfassembly'si için WindowsBaseMSB3277uyarısı verdi; WinFormsbrowser çalıştı. Son tekrarda bu bilinen uyarı bastırılmıştı; bunu kaynak uyumsuzluğu çözüldü kanıtı sayma. Ürüne bu proje veya .NETdependency eklenmedi; productionhost için hedef/assemblyreferansları ayrıca seçilmeli.

Probe sadece navigationstatus, başlık, metin uzunluğu, challenge/form işaretleri ve ekran görüntüsü döndürür. Ham HTML, cookie, token veya kullanıcı profili dışa aktarmaz. Açılan sayfa zamanla değişebilir; bu turdaki sonucu daha sonraki tarihler için garanti etmez.
