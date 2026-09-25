@echo off
chcp 65001 >nul
title The Royal Luxury Hotel - PMS
cd /d "%~dp0"

echo ============================================================
echo    THE ROYAL LUXURY HOTEL - PMS
echo ============================================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [HATA] Node.js bulunamadi.
  echo Lutfen once https://nodejs.org adresinden Node.js kurun.
  echo.
  pause
  exit /b 1
)

echo PMS baslatiliyor... Tarayici birkac saniye icinde acilacak.
echo Programi kapatmak icin bu pencereyi kapatin.
echo.

rem Sunucu ayaga kalkinca tarayiciyi ac (2 sn bekle)
start "" cmd /c "timeout /t 2 >nul & start http://localhost:4173"

node server.js

echo.
echo Sunucu durdu. Bir tusa basin...
pause >nul
