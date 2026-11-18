@echo off
title QuickList Pro Local Scraper Engine
echo ========================================================
echo   QuickList Pro - Local Product Scraper Engine
echo ========================================================
echo   Running local scraper bridge on http://localhost:5000 ...
echo   Keep this small window open while importing products.
echo ========================================================
powershell -ExecutionPolicy Bypass -NoProfile -File "%~dp0scraper_server.ps1"
pause
