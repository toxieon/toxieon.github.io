@echo off
setlocal
cd /d "%~dp0"
echo Installing pdf-unlock dependencies...
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
if errorlevel 1 (
  echo.
  echo Setup failed. Install Python 3.10+ from https://www.python.org/ and try again.
  exit /b 1
)
echo.
echo Setup complete. Drag a PDF onto unlock.bat or run:
echo   python pdf_unlock.py "path\to\locked.pdf"
exit /b 0
