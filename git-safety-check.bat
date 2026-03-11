@echo off
REM ============================================
REM Git Safety Check Script
REM ============================================
REM Run this before every commit to verify
REM no sensitive files will be committed
REM ============================================

echo.
echo ============================================
echo GIT SAFETY CHECK
echo ============================================
echo.

cd /d "x:\Antigravity\Projects\field-service-mgmt"

echo Checking for sensitive files in git staging...
echo.

REM Check staged files for sensitive patterns
git diff --cached --name-only > temp_staged.txt 2>nul

if %ERRORLEVEL% NEQ 0 (
    echo No files are staged for commit.
    echo.
    echo Current status:
    git status -s
    del temp_staged.txt 2>nul
    pause
    exit /b 0
)

REM Check for sensitive patterns
findstr /I /C:"serviceAccount" /C:".env" /C:"db.sqlite3" /C:"backup-" temp_staged.txt >nul 2>&1

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ========================================
    echo    WARNING: SENSITIVE FILES DETECTED!
    echo ========================================
    echo.
    echo The following sensitive files are staged:
    echo.
    findstr /I /C:"serviceAccount" /C:".env" /C:"db.sqlite3" /C:"backup-" temp_staged.txt
    echo.
    echo DO NOT COMMIT! These files contain:
    echo - API keys
    echo - Credentials
    echo - User data
    echo.
    echo To remove them from staging:
    echo   git reset HEAD ^<filename^>
    echo.
    del temp_staged.txt
    pause
    exit /b 1
) else (
    echo ========================================
    echo    SAFETY CHECK: PASSED!
    echo ========================================
    echo.
    echo No sensitive files detected in staging area.
    echo.
    echo Files staged for commit:
    type temp_staged.txt
    echo.
    echo You are safe to commit.
    echo.
    del temp_staged.txt
    pause
    exit /b 0
)
