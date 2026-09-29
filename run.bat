@echo off
REM Double-clickable launcher. Delegates to run.ps1 and bypasses the
REM execution policy for this process only, so no system change is needed.
REM PowerShell is called by full path: on some machines its folder is not on
REM PATH, and a bare "powershell" made this window flash and close.
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "%~dp0run.ps1" %*
echo.
if errorlevel 1 (
    echo Silent Voice did not start - see the message above.
) else (
    echo You can close this window. Keep the two server windows open.
)
pause
