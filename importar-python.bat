@echo off
chcp 65001 >nul
cd /d "%~dp0"
set "ORIGEM=%~1"
if "%ORIGEM%"=="" set "ORIGEM=C:\Sistemafmg\mercadinho\mercadinho.db"
set PYTHONIOENCODING=utf-8

echo Conferindo os dados de %ORIGEM% ...
python scripts\import_python.py "%ORIGEM%"
if errorlevel 1 goto :error

echo.
echo ATENCAO: a importacao SUBSTITUI produtos, clientes, vendas e fiado do sistema Java
echo pelos dados do sistema Python (um backup e feito antes, na pasta backups).
set /p OK=Digite S para importar: 
if /i not "%OK%"=="S" exit /b 0

powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\setup.ps1
if errorlevel 1 goto :error
docker compose up --build -d
if errorlevel 1 goto :error

echo Aguardando o sistema ficar pronto...
:wait
curl -fsS http://localhost:8080/actuator/health >nul 2>&1
if errorlevel 1 (timeout /t 5 /nobreak >nul & goto :wait)

python scripts\import_python.py "%ORIGEM%" --apply
if errorlevel 1 goto :error
echo.
echo Pronto! Abra http://localhost:3000 (usuario admin, senha ADMIN_PASSWORD no arquivo .env).
pause
exit /b 0

:error
echo Algo deu errado. Verifique se o Docker Desktop esta aberto e tente de novo.
pause
exit /b 1
