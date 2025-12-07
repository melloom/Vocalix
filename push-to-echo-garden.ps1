# Push to Echo-Garden Repository
Write-Host "=== Pushing to Echo-Garden ===" -ForegroundColor Cyan

# Set remote
Write-Host "`n1. Setting remote to Echo-Garden..." -ForegroundColor Yellow
git remote set-url origin https://github.com/melloom/Echo-Garden.git
$remote = git remote get-url origin
Write-Host "   Remote: $remote" -ForegroundColor Green

# Create new branch
Write-Host "`n2. Creating new branch 'update-push'..." -ForegroundColor Yellow
git checkout -b update-push 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "   Branch might already exist, switching to it..." -ForegroundColor Yellow
    git checkout update-push
}
$branch = git branch --show-current
Write-Host "   Current branch: $branch" -ForegroundColor Green

# Show what's not tracked
Write-Host "`n3. Checking untracked files..." -ForegroundColor Yellow
$untracked = git ls-files --others --exclude-standard
if ($untracked) {
    Write-Host "   Found untracked files:" -ForegroundColor Cyan
    $untracked | Select-Object -First 10 | ForEach-Object { Write-Host "     $_" }
    if (($untracked | Measure-Object).Count -gt 10) {
        Write-Host "     ... and $((($untracked | Measure-Object).Count) - 10) more" -ForegroundColor Cyan
    }
} else {
    Write-Host "   No untracked files" -ForegroundColor Yellow
}

# Show modified files
Write-Host "`n4. Checking modified files..." -ForegroundColor Yellow
$modified = git status --porcelain
if ($modified) {
    Write-Host "   Files to add:" -ForegroundColor Cyan
    $modified | ForEach-Object { Write-Host "     $_" }
} else {
    Write-Host "   No modified files" -ForegroundColor Yellow
}

# Add everything
Write-Host "`n5. Adding ALL files (including untracked)..." -ForegroundColor Yellow
git add -A -f
$added = git status --short
if ($added) {
    Write-Host "   Files staged:" -ForegroundColor Green
    $added | ForEach-Object { Write-Host "     $_" }
} else {
    Write-Host "   No files to stage" -ForegroundColor Yellow
}

# Commit
Write-Host "`n6. Committing changes..." -ForegroundColor Yellow
git commit -m "Update: push all changes to Echo-Garden - $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" --allow-empty
if ($LASTEXITCODE -eq 0) {
    Write-Host "   ✓ Committed successfully" -ForegroundColor Green
} else {
    Write-Host "   ⚠ Commit might have failed or nothing to commit" -ForegroundColor Yellow
}

# Show commit
$lastCommit = git log -1 --oneline
Write-Host "   Last commit: $lastCommit" -ForegroundColor Cyan

# Push
Write-Host "`n7. Pushing to origin/$branch..." -ForegroundColor Yellow
$pushOutput = git push -u origin $branch 2>&1
$exitCode = $LASTEXITCODE

Write-Host "`n   Push Output:" -ForegroundColor Cyan
foreach ($line in $pushOutput) {
    Write-Host "   $line" -ForegroundColor $(if ($exitCode -eq 0) { "Green" } else { "Red" })
}

Write-Host "`n   Exit Code: $exitCode" -ForegroundColor $(if ($exitCode -eq 0) { "Green" } else { "Red" })

if ($exitCode -eq 0) {
    Write-Host "`n✓ SUCCESS! Pushed to Echo-Garden!" -ForegroundColor Green
    Write-Host "   Branch: $branch" -ForegroundColor Cyan
    Write-Host "   Repository: https://github.com/melloom/Echo-Garden" -ForegroundColor Cyan
    Write-Host "   Branch URL: https://github.com/melloom/Echo-Garden/tree/$branch" -ForegroundColor Cyan
} else {
    Write-Host "`n✗ Push failed!" -ForegroundColor Red
    Write-Host "`nTrying force push..." -ForegroundColor Yellow
    $forceOutput = git push --force origin $branch 2>&1
    $forceExit = $LASTEXITCODE
    Write-Host "   Force push output:" -ForegroundColor Cyan
    $forceOutput | ForEach-Object { Write-Host "   $_" }
    Write-Host "   Exit Code: $forceExit" -ForegroundColor $(if ($forceExit -eq 0) { "Green" } else { "Red" })
}

Write-Host "`n=== Complete ===" -ForegroundColor Cyan
