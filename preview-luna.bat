@echo off
chcp 65001 >nul
setlocal
set "ELECTRON_RUN_AS_NODE="
cd /d "%~dp0"
REM Review build: separate profile; never opens or resets the normal user profile.
set "WHISPER_RESOURCE_SOAK_USER_DATA=%~dp0tmp\luna-preview-profile"
if not exist "%WHISPER_RESOURCE_SOAK_USER_DATA%" mkdir "%WHISPER_RESOURCE_SOAK_USER_DATA%"
echo Luna-style media home preview - separate profile.
echo Normal start.bat and the existing user profile are unchanged.
call "%~dp0start.bat"
