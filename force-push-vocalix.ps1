# Force Push to Vocalix Repository
Write-Host "=== Force Pushing to Vocalix ===" -ForegroundColor Cyan

# Check current state
Write-Host "`n1. Checking repository status..." -ForegroundColor Yellow
$isRepo = git rev-parse --git-dir 2>$null
if (-not $isRepo) {
    Write-Host "ERROR: Not a git repository!" -ForegroundColor Red
    exit 1
}

# Get current branch
$currentBranch = git branch --show-current
if ([string]::IsNullOrWhiteSpace($currentBranch)) {
    Write-Host "No branch found, checking for main or master..." -ForegroundColor Yellow
    $branches = git branch --list
    if ($branches -match "main") {
        git checkout main 2>$null
        $currentBranch = "main"
    } elseif ($branches -match "master") {
        git checkout master 2>$null
        $currentBranch = "master"
    } else {
        Write-Host "Creating main branch..." -ForegroundColor Yellow
        git checkout -b main 2>$null
        $currentBranch = "main"
    }
}
Write-Host "Current branch: $currentBranch" -ForegroundColor Green

# Check remote
Write-Host "`n2. Checking remote configuration..." -ForegroundColor Yellow
$remoteUrl = git remote get-url origin 2>$null
Write-Host "Remote URL: $remoteUrl" -ForegroundColor Cyan

# Set remote if needed
if ($remoteUrl -notmatch "Vocalix") {
    Write-Host "Setting remote to Vocalix..." -ForegroundColor Yellow
    git remote set-url origin https://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@github.com/melloom/Vocalix.git
}

# Stage and commit everything
Write-Host "`n3. Staging all changes..." -ForegroundColor Yellow
git add -A
$status = git status --porcelain
if ($status) {
    Write-Host "Files to commit:" -ForegroundColor Cyan
    $status | ForEach-Object { Write-Host "  $_" }
} else {
    Write-Host "No changes to stage" -ForegroundColor Yellow
}

Write-Host "`n4. Committing..." -ForegroundColor Yellow
git commit -m "Push all changes to Vocalix" --allow-empty
Write-Host "Commit created" -ForegroundColor Green

# Push with force
Write-Host "`n5. Force pushing to origin/$currentBranch..." -ForegroundColor Yellow
$pushOutput = git push --force origin $currentBranch 2>&1
$exitCode = $LASTEXITCODE

Write-Host "`nPush Output:" -ForegroundColor Cyan
$pushOutput | ForEach-Object { Write-Host $_ }

if ($exitCode -eq 0) {
    Write-Host "`n✓ SUCCESS! Push completed!" -ForegroundColor Green
} else {
    Write-Host "`n✗ Push failed with exit code: $exitCode" -ForegroundColor Red
    
    # Try alternative methods
    Write-Host "`nTrying alternative push methods..." -ForegroundColor Yellow
    
    # Try without force first
    Write-Host "Attempting regular push..." -ForegroundColor Yellow
    $pushOutput2 = git push -u origin $currentBranch 2>&1
    $exitCode2 = $LASTEXITCODE
    Write-Host "Output: $pushOutput2" -ForegroundColor Cyan
    Write-Host "Exit Code: $exitCode2" -ForegroundColor Cyan
}

Write-Host "`n=== Complete ===" -ForegroundColor Cyan
