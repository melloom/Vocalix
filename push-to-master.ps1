# Script to push all files to Echo-Garden master branch
Write-Host "=== Pushing to Echo-Garden Master Branch ===" -ForegroundColor Cyan

# Navigate to repository
Set-Location "c:\Users\Mperalta\Desktop\echo-garden-49-main"

# Check current status
Write-Host "`n1. Checking git status..." -ForegroundColor Yellow
git status

# Verify remote
Write-Host "`n2. Checking remote configuration..." -ForegroundColor Yellow
git remote -v

# Add all files
Write-Host "`n3. Adding all files..." -ForegroundColor Yellow
git add -A
$status = git status --porcelain
if ($status) {
    Write-Host "   Files to be committed:" -ForegroundColor Green
    $status | ForEach-Object { Write-Host "   $_" -ForegroundColor Cyan }
} else {
    Write-Host "   No changes to commit" -ForegroundColor Yellow
}

# Commit changes
Write-Host "`n4. Committing changes..." -ForegroundColor Yellow
git commit -m "Update: Push all files to master branch" 2>&1 | ForEach-Object { Write-Host "   $_" }

# Check current branch
Write-Host "`n5. Checking current branch..." -ForegroundColor Yellow
$currentBranch = git branch --show-current
Write-Host "   Current branch: $currentBranch" -ForegroundColor Cyan

# Create or switch to master branch
if ($currentBranch -ne "master") {
    Write-Host "`n6. Creating/switching to master branch..." -ForegroundColor Yellow
    git checkout -b master 2>&1 | ForEach-Object { Write-Host "   $_" }
    if ($LASTEXITCODE -ne 0) {
        git checkout master 2>&1 | ForEach-Object { Write-Host "   $_" }
    }
}

# Merge main into master if needed
if ($currentBranch -eq "main") {
    Write-Host "`n7. Merging main into master..." -ForegroundColor Yellow
    git checkout master 2>&1 | ForEach-Object { Write-Host "   $_" }
    git merge main -m "Merge main into master" 2>&1 | ForEach-Object { Write-Host "   $_" }
}

# Push to master
Write-Host "`n8. Pushing to origin/master..." -ForegroundColor Yellow
Write-Host "   This may require authentication..." -ForegroundColor Yellow
$pushOutput = git push origin master --force --verbose 2>&1
$pushOutput | ForEach-Object { Write-Host "   $_" }

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n✓ Successfully pushed to master!" -ForegroundColor Green
} else {
    Write-Host "`n✗ Push failed. Error code: $LASTEXITCODE" -ForegroundColor Red
    Write-Host "`nTrying alternative method..." -ForegroundColor Yellow
    git push origin HEAD:master --force 2>&1 | ForEach-Object { Write-Host "   $_" }
}

Write-Host "`n=== Complete ===" -ForegroundColor Cyan
Write-Host "Check your repository at: https://github.com/melloom/Echo-Garden/tree/master" -ForegroundColor Cyan
