@echo off
REM Build the portable Windows bundle into release\PortableApplicationsServer\.
REM Requires the .venv from the README setup steps and Node.js for the frontend.

setlocal

cd /d "%~dp0"

if not exist ".venv\Scripts\python.exe" (
    echo [build] .venv not found. Run the setup steps in README.md first.
    exit /b 1
)

echo [build] Building the frontend...
call npm run build
if errorlevel 1 (
    echo [build] Frontend build failed.
    exit /b 1
)

if not exist "dist\index.html" (
    echo [build] dist\index.html is missing after the frontend build.
    exit /b 1
)

echo [build] Packaging with PyInstaller...
".venv\Scripts\python.exe" -m PyInstaller --noconfirm --clean ^
    --distpath release ^
    --workpath build\pyinstaller ^
    pyinstaller.spec
if errorlevel 1 (
    echo [build] PyInstaller failed.
    exit /b 1
)

echo.
echo [build] Done: release\PortableApplicationsServer\PortableApplicationsServer.exe
echo [build] Copy that folder anywhere; data\ is created beside the exe on first run.

endlocal
