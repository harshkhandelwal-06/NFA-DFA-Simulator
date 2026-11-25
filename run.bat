@echo off
setlocal
cd /d "%~dp0"
title NFA to DFA Simulator

:menu
cls
echo ==========================================
echo   NFA to DFA Simulator
echo ==========================================
echo.
echo   1. Open the simulator (no install needed)
echo   2. Start local dev server (needs Node.js)
echo   3. Rebuild the single-file version (needs Node.js)
echo   4. Run unit tests (needs Node.js)
echo   5. Run all tests (needs Node.js, Playwright, Python)
echo   6. Install test dependencies (needs Node.js)
echo   0. Exit
echo.
set "choice="
set /p choice=Choose an option: 

if "%choice%"=="1" goto open
if "%choice%"=="2" goto serve
if "%choice%"=="3" goto build
if "%choice%"=="4" goto unit
if "%choice%"=="5" goto all
if "%choice%"=="6" goto install
if "%choice%"=="0" goto end
goto menu

:open
if exist "dist\nfa-dfa-simulator.html" (
  start "" "dist\nfa-dfa-simulator.html"
) else (
  start "" "index.html"
)
goto menu

:neednode
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo Node.js is not installed. Get it from https://nodejs.org and run this again.
  pause
  exit /b 1
)
exit /b 0

:serve
call :neednode || goto menu
echo.
echo Starting at http://localhost:8080  (press Ctrl+C to stop)
start "" "http://localhost:8080"
node scripts\serve.js
pause
goto menu

:build
call :neednode || goto menu
echo.
node scripts\build.js
pause
goto menu

:unit
call :neednode || goto menu
echo.
call npm test
pause
goto menu

:all
call :neednode || goto menu
echo.
if not exist node_modules (
  echo Dependencies are missing. Choose option 6 first.
  pause
  goto menu
)
call npm run test:all
pause
goto menu

:install
call :neednode || goto menu
echo.
call npm install
call npx playwright install chromium
echo.
echo For the library cross-check, also run:  pip install automata-lib==9.2.0
pause
goto menu

:end
endlocal
