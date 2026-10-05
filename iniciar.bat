@echo off
cd /d "%~dp0"
title Mercadinho - iniciando
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\setup.ps1 >nul
if errorlevel 1 goto :error

rem Liga o Docker Desktop se ainda nao estiver rodando e espera o motor responder.
docker version --format "{{.Server.Version}}" >nul 2>&1
if not errorlevel 1 goto :up
echo Ligando o Docker...
set "DOCKER=%LOCALAPPDATA%\Programs\DockerDesktop\Docker Desktop.exe"
if not exist "%DOCKER%" set "DOCKER=%ProgramFiles%\Docker\Docker\Docker Desktop.exe"
start "" "%DOCKER%"
set /a TRIES=0
:waitdocker
timeout /t 3 /nobreak >nul
docker version --format "{{.Server.Version}}" >nul 2>&1
if not errorlevel 1 goto :up
set /a TRIES+=1
if %TRIES% lss 100 goto :waitdocker
goto :error

:up
echo Iniciando o sistema...
docker compose up -d
if errorlevel 1 goto :error
set /a TRIES=0
:waitapp
curl -fsS http://localhost:3000/api/v1/auth/csrf >nul 2>&1
if not errorlevel 1 goto :open
set /a TRIES+=1
if %TRIES% gtr 60 goto :error
timeout /t 2 /nobreak >nul
goto :waitapp

:open
rem Abre como aplicativo (janela propria, sem barra de endereco), com impressao direta na
rem impressora padrao (Control iD). O perfil proprio garante as opcoes mesmo com outro Edge
rem aberto; a balanca (Web Serial) tambem funciona nele.
set "EDGE=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not exist "%EDGE%" set "EDGE=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
if not exist "%EDGE%" goto :browser
start "" "%EDGE%" --kiosk-printing --start-maximized --no-first-run --user-data-dir="%LOCALAPPDATA%\SistemaJava\Navegador" --app=http://localhost:3000
exit /b 0

:browser
start "" "http://localhost:3000"
exit /b 0

:error
echo Nao foi possivel iniciar. Abra o Docker Desktop e tente de novo.
pause
exit /b 1
