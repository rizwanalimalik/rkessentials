@echo off
title Push QuickList Pro to GitHub
set "PATH=C:\Users\riz_t\AppData\Local\Programs\Git\cmd;%PATH%"
cd /d "%~dp0"

echo =========================================================
echo   Pushing QuickList Pro to GitHub
echo =========================================================
echo.

git branch -M main
git push -u origin main

if %ERRORLEVEL% equ 0 (
    echo.
    echo =====================================================
    echo   SUCCESS! Repository pushed to GitHub!
    echo =====================================================
) else (
    echo.
    echo =====================================================
    echo   Notice:
    echo   If you haven't created the repository on GitHub yet:
    echo   1. Go to https://github.com/new
    echo   2. Create a repository (e.g. quicklist-pro)
    echo   3. Run this script again or check credentials.
    echo =====================================================
)

pause
