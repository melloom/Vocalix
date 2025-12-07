# Comprehensive Git Push Diagnostic
Write-Host "=== Git Push Diagnostic ===" -ForegroundColor Cyan

# 1. Check if git repo
Write-Host "`n1. Repository Check:" -ForegroundColor Yellow
$isRepo = git rev-parse --git-dir 2>$null
if ($isRepo) {
    Write-Host "   ✓ Git repository found" -ForegroundColor Green
} else {
    Write-Host "   ✗ Not a git repository!" -ForegroundColor Red
    exit 1
}

# 2. Check remote
Write-Host "`n2. Remote Configuration:" -ForegroundColor Yellow
$remote = git remote get-url origin 2>$null
Write-Host "   Remote URL: $remote" -ForegroundColor Cyan
if ($remote -notmatch "Vocalix") {
    Write-Host "   ⚠ Remote doesn't point to Vocalix!" -ForegroundColor Yellow
    Write-Host "   Setting remote to Vocalix..." -ForegroundColor Yellow
    git remote set-url origin https://github.com/melloom/Vocalix.git
    Write-Host "   ✓ Remote updated" -ForegroundColor Green
}

# 3. Check branch
Write-Host "`n3. Branch Information:" -ForegroundColor Yellow
$branch = git branch --show-current
if ([string]::IsNullOrWhiteSpace($branch)) {
    Write-Host "   No branch checked out, creating main..." -ForegroundColor Yellow
    git checkout -b main 2>$null
    $branch = "main"
}
Write-Host "   Current branch: $branch" -ForegroundColor Cyan

# 4. Check commits
Write-Host "`n4. Commit Information:" -ForegroundColor Yellow
$commitCount = git rev-list --count HEAD 2>$null
Write-Host "   Total commits: $commitCount" -ForegroundColor Cyan
$lastCommit = git log -1 --oneline 2>$null
Write-Host "   Last commit: $lastCommit" -ForegroundColor Cyan

# 5. Check files
Write-Host "`n5. Tracked Files:" -ForegroundColor Yellow
$fileCount = (git ls-files | Measure-Object -Line).Lines
Write-Host "   Tracked files: $fileCount" -ForegroundColor Cyan

# 6. Stage and commit everything
Write-Host "`n6. Staging and Committing:" -ForegroundColor Yellow
git add -A
$status = git status --porcelain
if ($status) {
    Write-Host "   Files to commit:" -ForegroundColor Cyan
    $status | ForEach-Object { Write-Host "     $_" }
    git commit -m "Push all changes to Vocalix - $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" --allow-empty
    Write-Host "   ✓ Committed" -ForegroundColor Green
} else {
    Write-Host "   No changes to commit" -ForegroundColor Yellow
    git commit -m "Empty commit to trigger push - $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" --allow-empty
    Write-Host "   ✓ Created empty commit" -ForegroundColor Green
}

# 7. Attempt push with detailed output
Write-Host "`n7. Attempting Push:" -ForegroundColor Yellow
Write-Host "   Command: git push --force origin $branch" -ForegroundColor Cyan

$ErrorActionPreference = "Continue"
$pushOutput = @()
$pushOutput = git push --force origin $branch 2>&1
$exitCode = $LASTEXITCODE

Write-Host "`n   Push Output:" -ForegroundColor Cyan
foreach ($line in $pushOutput) {
    Write-Host "   $line" -ForegroundColor $(if ($exitCode -eq 0) { "Green" } else { "Red" })
}

Write-Host "`n   Exit Code: $exitCode" -ForegroundColor $(if ($exitCode -eq 0) { "Green" } else { "Red" })

if ($exitCode -eq 0) {
    Write-Host "`n✓ SUCCESS! Push completed!" -ForegroundColor Green
    Write-Host "   Check: https://github.com/melloom/Vocalix" -ForegroundColor Cyan
} else {
    Write-Host "`n✗ Push failed!" -ForegroundColor Red
    Write-Host "`nTroubleshooting:" -ForegroundColor Yellow
    Write-Host "   1. Verify token is valid: https://github.com/settings/tokens" -ForegroundColor Cyan
    Write-Host "   2. Check repository exists: https://github.com/melloom/Vocalix" -ForegroundColor Cyan
    Write-Host "   3. Verify you have push access" -ForegroundColor Cyan
    Write-Host "   4. Try: git push -u origin $branch (without --force)" -ForegroundColor Cyan
}

Write-Host "`n=== Diagnostic Complete ===" -ForegroundColor Cyan
Write-Host "`nPress any key to exit..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
