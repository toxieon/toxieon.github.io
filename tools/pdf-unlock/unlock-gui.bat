@echo off
setlocal
cd /d "%~dp0"
python "%~dp0pdf_unlock_gui.py"
if errorlevel 1 pause
exit /b %errorlevel%
