@echo off
chcp 65001 >nul
title EARLY.HOST — 3D Web Sunucusu
cd /d "%~dp0"
cls
echo ==========================================================
echo   EARLY.HOST WEB PLATFORMU BASLATILIYOR...
echo   Tarayiciniz otomatik acilacaktir: http://localhost:3000
echo   Thanks to hta
echo ==========================================================
start "" "http://localhost:3000"
node server.js
pause
