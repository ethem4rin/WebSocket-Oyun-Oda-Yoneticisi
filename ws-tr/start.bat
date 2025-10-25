@echo off
echo cs kim
echo.

node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo node.js yok
    pause
    exit /b 1
)

if not exist "node_modules" (
    npm install
    if %errorlevel% neq 0 (
        echo npm hata
        pause
        exit /b 1
    )
)

echo sss
echo.
npm start 