@echo off
cd /d "%~dp0"
docker compose down
echo Dados e backups preservados nos volumes Docker.
pause
