@echo off
echo ========================================
echo Antigravity Backup - Setup
echo ========================================
echo.
echo This will install the required Python package: firebase-admin
echo.
pause

echo Installing firebase-admin...
pip install firebase-admin

echo.
echo ========================================
echo Setup complete!
echo ========================================
echo.
echo Next steps:
echo 1. Get your Firebase service account key from:
echo    https://console.firebase.google.com
echo.
echo 2. Save it as: firebase\serviceAccountKey.json
echo.
echo 3. Run: run-backup.bat
echo.
pause
