@echo off
chcp 65001 >nul
title Early.Host Scrapper

:: Windows Konsolunda Sag Tik ve Hizli Duzenleme (Yapistirma) Modunu Etkinlestir
reg add HKCU\Console /v QuickEdit /t REG_DWORD /d 1 /f >nul 2>&1
reg add HKCU\Console /v EnableColorSelection /t REG_DWORD /d 1 /f >nul 2>&1

cls

if exist "EarlyHost.exe" (
    EarlyHost.exe
) else (
    node scrapper.js
)

pause
