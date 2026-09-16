@echo off
rem ===================================================================
rem  Tool Site - Windows one-click local preview
rem  Double-click this file to start a local server and open the site.
rem  (ASCII only on purpose: Chinese text in .bat files breaks under
rem   the default GBK console codepage.)
rem ===================================================================
setlocal
cd /d "%~dp0"

title Tool Site - Local Preview

where node >nul 2>nul
if errorlevel 1 goto nonode

echo.
echo   Starting local preview server...
echo.
node "%~dp0dev-server.js" %*
goto end

:nonode
echo.
echo   [!] Node.js was not found in PATH.
echo.
echo       This project needs Node.js to build and preview.
echo       Download it here: https://nodejs.org
echo.
echo       Already installed but still not found? Close this window,
echo       reopen it, and try again (PATH needs a refresh).
echo.
pause
exit /b 1

:end
echo.
pause
