@echo off
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\setup.ps1
if errorlevel 1 goto :error
docker compose up --build -d
if errorlevel 1 goto :error
echo SistemaJava disponivel em http://localhost:3000
echo Usuario: admin. Consulte ADMIN_PASSWORD no arquivo .env.

rem Abre no Edge em tela cheia (F11 sai), com impressao direta na impressora padrao (Control iD).
rem O perfil proprio garante a opcao mesmo com outro Edge aberto; a balanca (Web Serial) tambem funciona nele.
set "EDGE=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not exist "%EDGE%" set "EDGE=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
if not exist "%EDGE%" goto :browser
start "" "%EDGE%" --kiosk-printing --start-fullscreen --user-data-dir="%LOCALAPPDATA%\SistemaJava\Navegador" --app=http://localhost:3000
exit /b 0

:browser
start "" "http://localhost:3000"
exit /b 0

:error
echo Nao foi possivel iniciar. Verifique se o Docker Desktop esta em execucao.
pause
exit /b 1
