@echo off
setlocal
cd /d "%~dp0"
if "%~1"=="" (
  echo Drop a password-protected PDF onto this file, or run:
  echo   unlock.bat "C:\path\to\file.pdf"
  pause
  exit /b 1
)
python "%~dp0pdf_unlock.py" %*
if errorlevel 1 pause
exit /b %errorlevel%
