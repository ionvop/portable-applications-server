@echo off
REM Build the portable Windows bundle into release\CHU2PLAY\.
REM Requires the .venv from the README setup steps and Node.js for the frontend.
REM
REM The build is verified before it is declared done: the frozen exe runs its own
REM --selftest (frontend served from the bundle, data folder beside the exe, API
REM answering), then the whole folder is copied to %TEMP% and the selftest is run
REM again there to prove the bundle is portable.

setlocal

cd /d "%~dp0"

set "BUNDLE=release\CHU2PLAY"
set "EXE=%BUNDLE%\CHU2PLAY.exe"

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

REM A previous run may have left data\ inside the bundle. Shipping it would
REM carry stale installs and a stale server address to every client machine.
if exist "release" (
    echo [build] Removing the previous release folder...
    rmdir /s /q "release"
    if exist "release" (
        echo [build] Could not remove release\. Close any running copy and retry.
        exit /b 1
    )
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

if not exist "%EXE%" (
    echo [build] %EXE% was not produced.
    exit /b 1
)

echo [build] Verifying the bundle in place...
call :selftest "%EXE%" "%TEMP%\pac-selftest.log"
if errorlevel 1 (
    echo [build] The packaged application failed its selftest.
    exit /b 1
)

echo [build] Verifying the bundle from a copied folder...
set "COPY=%TEMP%\pac-copy-%RANDOM%%RANDOM%"
xcopy "%BUNDLE%" "%COPY%\" /e /i /q /h >nul
if errorlevel 1 (
    echo [build] Could not copy the bundle to %COPY%.
    exit /b 1
)

call :selftest "%COPY%\CHU2PLAY.exe" "%TEMP%\pac-selftest-copy.log"
if errorlevel 1 (
    echo [build] The copied bundle failed its selftest.
    rmdir /s /q "%COPY%"
    exit /b 1
)

if not exist "%COPY%\data\client.db" (
    echo [build] The copied bundle did not create data\ beside its exe.
    rmdir /s /q "%COPY%"
    exit /b 1
)

rmdir /s /q "%COPY%"

REM The selftest created data\ beside the exe. It must not ship.
if exist "%BUNDLE%\data" rmdir /s /q "%BUNDLE%\data"

echo.
echo [build] Done: %EXE%
echo [build] Copy that folder anywhere; data\ is created beside the exe on first run.
echo [build] Selftest reports: %TEMP%\pac-selftest.log, %TEMP%\pac-selftest-copy.log

endlocal
pause
exit /b 0

REM ---------------------------------------------------------------------------
REM :selftest <exe> <report>
REM Runs the frozen exe's headless verification and checks the report verdict.
REM The exe is windowed, so the exit code and the report file are the only
REM signals available.
REM ---------------------------------------------------------------------------
:selftest
if exist "%~2" del /q "%~2"
"%~1" --selftest --selftest-log "%~2"
if errorlevel 1 (
    echo [build]   selftest exited with an error. Report: %~2
    if exist "%~2" type "%~2"
    exit /b 1
)
if not exist "%~2" (
    echo [build]   selftest wrote no report to %~2
    exit /b 1
)
findstr /c:"SELFTEST: PASS" "%~2" >nul
if errorlevel 1 (
    echo [build]   selftest did not report PASS. Report: %~2
    type "%~2"
    exit /b 1
)
echo [build]   selftest passed.
exit /b 0
