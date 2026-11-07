@echo off
chcp 65001 >nul
title ORAN ANALIZ PRO - 7/24 Kapanis Orani ve Bulten Sistemi
echo ==========================================================
echo   ORAN ANALIZ PRO BASLATILIYOR...
echo ==========================================================
cd /d "%~dp0"

echo [1/3] GitHub uzerinde 7/24 kaydedilen guncel arsiv indiriliyor...
git fetch origin main 2>nul
git checkout origin/main -- backend/data/matches.json 2>nul
git pull origin main --no-edit 2>nul

echo [2/3] Tarayici aciliyor (http://localhost:5000)...
start "" "http://localhost:5000"

echo [3/3] Sunucu baslatiliyor...
cd backend
node server.js
pause
