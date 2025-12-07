# Fix Master Branch Push Script
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Fix Master Branch Push to Echo-Garden" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

$repoPath = "c:\Users\Mperalta\Desktop\echo-garden-49-main"
Set-Location $repoPath

# Step 1: Verify remote
Write-Host "`n[1/6] Verifying remote..." -ForegroundColor Yellow
$remote = git remote get-url origin
Write-Host "   Remote: $remote" -ForegroundColor Cyan
if ($remote -notlike "*Echo-Garden*") {
    Write-Host "   Setting remote to Echo-Garden..." -ForegroundColor Yellow
    git remote set-url origin https://github.com/melloom/Echo-Garden.git
    Write-Host "   ✓ Remote updated" -ForegroundColor Green
}

# Step 2: Check current branch
Write-Host "`n[2/6] Checking current branch..." -ForegroundColor Yellow
$currentBranch = git rev-parse --abbrev-ref HEAD
Write-Host "   Current branch: $currentBranch" -ForegroundColor Cyan

# Step 3: Add all files
Write-Host "`n[3/6] Adding all files..." -ForegroundColor Yellow
git add -A
$staged = git diff --cached --name-only
if ($staged) {
    Write-Host "   ✓ Added $($staged.Count) files" -ForegroundColor Green
} else {
    Write-Host "   No new files to add" -ForegroundColor Yellow
}

# Step 4: Commit
Write-Host "`n[4/6] Committing changes..." -ForegroundColor Yellow
$commitMsg = "Update: Push all files to master branch - $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
git commit -m $commitMsg 2>&1 | Out-Null
if ($LASTEXITCODE -eq 0) {
    Write-Host "   ✓ Committed successfully" -ForegroundColor Green
} else {
    Write-Host "   No changes to commit (or already committed)" -ForegroundColor Yellow
}

# Step 5: Ensure we're on master or create it
Write-Host "`n[5/6] Ensuring master branch exists..." -ForegroundColor Yellow
if ($currentBranch -ne "master") {
    # Check if master exists locally
    $masterExists = git branch --list master
    if (-not $masterExists) {
        Write-Host "   Creating master branch from $currentBranch..." -ForegroundColor Yellow
        git checkout -b master 2>&1 | Out-Null
        Write-Host "   ✓ Master branch created" -ForegroundColor Green
    } else {
        Write-Host "   Switching to existing master branch..." -ForegroundColor Yellow
        git checkout master 2>&1 | Out-Null
        Write-Host "   ✓ Switched to master" -ForegroundColor Green
        # Merge main into master if we were on main
        if ($currentBranch -eq "main") {
            Write-Host "   Merging main into master..." -ForegroundColor Yellow
            git merge main --no-edit 2>&1 | Out-Null
            Write-Host "   ✓ Merged main into master" -ForegroundColor Green
        }
    }
} else {
    Write-Host "   Already on master branch" -ForegroundColor Green
}

# Step 6: Push to master
Write-Host "`n[6/6] Pushing to origin/master..." -ForegroundColor Yellow
Write-Host "   This may prompt for credentials..." -ForegroundColor Yellow
$pushOutput = git push origin master --force 2>&1
$pushOutput | ForEach-Object { Write-Host "   $_" }

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n✓ SUCCESS! Files pushed to master branch" -ForegroundColor Green
    Write-Host "`nView your repository at:" -ForegroundColor Cyan
    Write-Host "   https://github.com/melloom/Echo-Garden/tree/master" -ForegroundColor White
} else {
    Write-Host "`n✗ Push failed. Exit code: $LASTEXITCODE" -ForegroundColor Red
    Write-Host "`nTrying alternative push method..." -ForegroundColor Yellow
    git push origin HEAD:master --force 2>&1 | ForEach-Object { Write-Host "   $_" }
    if ($LASTEXITCODE -eq 0) {
        Write-Host "`n✓ SUCCESS with alternative method!" -ForegroundColor Green
    }
}

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  Complete" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
