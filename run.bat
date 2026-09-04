@echo off
REM Double-clickable launcher. Delegates to run.ps1 and bypasses the
REM execution policy for this process only, so no system change is needed.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0run.ps1" %*
