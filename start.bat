@echo off
title JARVIS — Remote Terminal Controller

REM Verifica que existe el .env
if not exist ".env" (
    echo [ERROR] No se encontro el archivo .env
    echo Copia .env.example a .env y configura las variables.
    pause
    exit /b 1
)

echo.
echo  ============================================
echo   JARVIS — Remote Terminal Controller
echo  ============================================
echo.
echo  Iniciando servidor...
echo  Dashboard: http://localhost:3000
echo.

npm run dev

pause
