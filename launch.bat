@echo off
title FormCheck
cd /d C:\dev\formcheck

REM Kill any existing server on port 3001
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3001" ^| findstr LISTENING') do (
  taskkill /PID %%a /F >nul 2>&1
)

REM Clear browser cache for localhost
del /q "%LOCALAPPDATA%\Google\Chrome\User Data\Default\Cache\Cache_Data\*" 2>nul
del /q "%LOCALAPPDATA%\Microsoft\Edge\User Data\Default\Cache\Cache_Data\*" 2>nul

timeout /t 2 /nobreak >nul

REM Start server in background
start "FormCheck Server" /MIN cmd /c "node server.js"

REM Wait for server to start
timeout /t 3 /nobreak >nul

REM Open browser with cache bypass timestamp
start "" "http://localhost:3001/?v=%RANDOM%%RANDOM%"

echo.
echo ============================================
echo   FormCheck server is running
echo   Browser opened (cache cleared)
echo ============================================
echo.
pause
