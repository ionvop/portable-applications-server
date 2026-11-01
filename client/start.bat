@echo off
REM Development launcher: runs the client from source with the local virtualenv.
REM For the packaged build, run build.bat and start
REM release\PortableApplicationsClient\PortableApplicationsClient.exe instead.

cd /d "%~dp0"
".venv\Scripts\python.exe" run.py
pause
