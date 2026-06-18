@echo off
title JARVIS — Iniciando en segundo plano

if not exist ".env" (
    echo [ERROR] No se encontro .env
    pause
    exit /b 1
)

echo Iniciando JARVIS en segundo plano...
start /B npm run dev > jarvis.log 2>&1

echo.
echo JARVIS corriendo en: http://localhost:3000
echo Logs en: jarvis.log
echo Para detener: detener.bat
echo.
pause
