@echo off
chcp 65001 >nul
title Discord Scraper Bot - VDS

:: Windows Konsolunda Sag Tik ve Hizli Duzenleme Modunu Etkinlestir
reg add HKCU\Console /v QuickEdit /t REG_DWORD /d 1 /f >nul 2>&1
reg add HKCU\Console /v EnableColorSelection /t REG_DWORD /d 1 /f >nul 2>&1

cls
echo ===================================================
echo     Discord Rozet Tarayici Botu Baslatiliyor...
echo ===================================================
echo.

node bot.js

echo.
echo Bot durduruldu.
pause
