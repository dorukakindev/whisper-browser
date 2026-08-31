@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

set "PY=%~dp0backend\venv\Scripts\python.exe"
set "PKG=%~dp0node_modules\electron\dist"

if not exist "%PY%" (
    echo HATA: Python sanal ortami bulunamadi.
    echo Once install.bat dosyasini calistirin.
    pause
    exit /b 1
)
if not exist "%PKG%\electron.exe" (
    echo HATA: Widevine destekli Electron bulunamadi.
    echo Once install.bat dosyasini calistirin.
    pause
    exit /b 1
)

echo.
echo Whisper Altyazi - DRM / Widevine hazirligi
echo ==========================================
echo.
echo 1 - Ilk kez kullaniyorum: EVS hesabi olustur
echo 2 - Zaten hesabim var: bu bilgisayarda giris yap
echo 3 - Hesap hazir: paketi imzala ve dogrula
echo 4 - Cik
echo.
choice /c 1234 /n /m "Seciminiz: "
if errorlevel 4 exit /b 0
if errorlevel 3 goto sign
if errorlevel 2 goto reauth
if errorlevel 1 goto signup

:signup
echo.
echo Castlabs EVS kaydi basliyor.
echo E-posta, ad, soyad, hesap adi ve parolayi bu pencereye girin.
echo Parolanizi kimseyle paylasmayin.
"%PY%" -m castlabs_evs.account signup
if errorlevel 1 goto failed
goto sign

:reauth
echo.
echo Castlabs EVS girisi basliyor.
echo Hesap adinizi ve parolanizi bu pencereye girin.
"%PY%" -m castlabs_evs.account reauth
if errorlevel 1 goto failed
goto sign

:sign
echo.
echo Electron paketi imzalaniyor. Bu islem internet baglantisi ister.
"%PY%" -m castlabs_evs.vmp sign-pkg "%PKG%"
if errorlevel 1 goto failed
echo.
echo Imza dogrulaniyor:
"%PY%" -m castlabs_evs.vmp verify-pkg "%PKG%"
if errorlevel 1 goto failed
echo.
echo TAMAM: Uretim VMP imzasi dogrulandi.
echo Simdi bu pencereyi kapatip start.bat ile uygulamayi yeniden acin.
pause
exit /b 0

:failed
echo.
echo Islem tamamlanamadi. Yukaridaki hata mesajini kontrol edin.
pause
exit /b 1
