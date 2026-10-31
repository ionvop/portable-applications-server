@echo off
REM Development launcher: runs the app from source with the local virtualenv.
REM For the packaged build, run build.bat and start
REM release\PortableApplicationsServer\PortableApplicationsServer.exe instead.

cd /d "%~dp0"
".venv\Scripts\python.exe" run.py
pause