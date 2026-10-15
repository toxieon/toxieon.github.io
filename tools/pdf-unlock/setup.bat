@echo off
setlocal
cd /d "%~dp0"
echo pdf-unlock setup (lightweight — needs Python + qpdf only)
echo.

where python >nul 2>&1
if errorlevel 1 (
  echo Python not found. Install Python 3.10+ from https://www.python.org/
  exit /b 1
)

where qpdf >nul 2>&1
if errorlevel 1 (
  echo qpdf not found on PATH.
  echo Install with:  winget install qpdf.qpdf
  echo Or download from https://github.com/qpdf/qpdf/releases
  exit /b 1
)

echo Python:
python --version
echo qpdf:
qpdf --version
echo.
echo Ready. Double-click unlock-gui.bat or drag a PDF onto unlock.bat
exit /b 0
