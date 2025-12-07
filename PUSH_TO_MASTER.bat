@echo off
echo ========================================
echo   Pushing to Echo-Garden Master Branch
echo ========================================
echo.

cd /d "c:\Users\Mperalta\Desktop\echo-garden-49-main"

echo [1] Setting remote to Echo-Garden...
git remote set-url origin https://github.com/melloom/Echo-Garden.git
echo.

echo [2] Adding all files...
git add -A
echo.

echo [3] Committing changes...
git commit -m "Update: Push all files to master branch"
echo.

echo [4] Checking current branch...
git branch --show-current
echo.

echo [5] Creating/switching to master branch...
git checkout -b master 2>nul || git checkout master
echo.

echo [6] Merging main into master (if on main)...
git merge main --no-edit 2>nul
echo.

echo [7] Pushing to origin/master...
echo    (You may be prompted for GitHub credentials)
git push origin master --force
echo.

if %ERRORLEVEL% EQU 0 (
    echo ========================================
    echo   SUCCESS! Files pushed to master
    echo ========================================
    echo.
    echo View at: https://github.com/melloom/Echo-Garden/tree/master
) else (
    echo ========================================
    echo   Push failed. Error code: %ERRORLEVEL%
    echo ========================================
    echo.
    echo Trying alternative method...
    git push origin HEAD:master --force
)

echo.
pause
