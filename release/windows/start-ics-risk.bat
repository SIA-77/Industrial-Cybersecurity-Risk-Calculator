@echo off
setlocal

set SCRIPT_DIR=%~dp0
set PROJECT_ROOT=%SCRIPT_DIR%..\..

where docker >nul 2>nul
if errorlevel 1 (
  echo Docker is not installed or not available in PATH.
  exit /b 1
)

if not exist "%PROJECT_ROOT%\backend\.env" (
  copy "%PROJECT_ROOT%\.env.example" "%PROJECT_ROOT%\backend\.env" >nul
  echo Created backend\.env from .env.example. Edit it if you need recommendations.
)

cd /d "%PROJECT_ROOT%"
docker compose up --build
