@echo off
echo ========================================
echo Antigravity Backup Tool
echo ========================================
echo.

REM Check if Python is available
python --version >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Python not found!
    echo Please install Python 3.6 or later
    pause
    exit /b 1
)

REM Run the backup script
echo Starting backup...
echo.
python backup-antigravity.py

echo.
echo ========================================
echo Backup script finished!
echo ========================================
pause
