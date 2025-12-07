# Git Push Diagnostic and Fix Script
Write-Host "=== Git Push Diagnostic ===" -ForegroundColor Cyan

# Check if we're in a git repository
Write-Host "`n1. Checking if this is a git repository..." -ForegroundColor Yellow
$isGitRepo = git rev-parse --git-dir 2>$null
if (-not $isGitRepo) {
    Write-Host "   ERROR: This is not a git repository!" -ForegroundColor Red
    Write-Host "   Run: git init" -ForegroundColor Yellow
    exit 1
}
Write-Host "   ✓ This is a git repository" -ForegroundColor Green

# Check current branch
Write-Host "`n2. Checking current branch..." -ForegroundColor Yellow
$currentBranch = git branch --show-current
Write-Host "   Current branch: $currentBranch" -ForegroundColor Cyan

# Check remote configuration
Write-Host "`n3. Checking remote configuration..." -ForegroundColor Yellow
$remotes = git remote -v
if ([string]::IsNullOrWhiteSpace($remotes)) {
    Write-Host "   ERROR: No remote configured!" -ForegroundColor Red
    Write-Host "   You need to add a remote. Example:" -ForegroundColor Yellow
    Write-Host "   git remote add origin https://github.com/username/repo.git" -ForegroundColor Yellow
    exit 1
} else {
    Write-Host "   Remotes configured:" -ForegroundColor Green
    $remotes | ForEach-Object { Write-Host "   $_" -ForegroundColor Cyan }
}

# Check if there are commits to push
Write-Host "`n4. Checking if there are commits to push..." -ForegroundColor Yellow
$status = git status -sb
$hasCommits = git log origin/$currentBranch..HEAD 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "   Branch might not be tracking remote yet" -ForegroundColor Yellow
    $hasCommits = git log --oneline -1 2>$null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "   You have local commits. Setting up tracking..." -ForegroundColor Yellow
        git branch --set-upstream-to=origin/$currentBranch $currentBranch 2>$null
        if ($LASTEXITCODE -ne 0) {
            Write-Host "   Remote branch doesn't exist yet. First push:" -ForegroundColor Yellow
            Write-Host "   git push -u origin $currentBranch" -ForegroundColor Cyan
        }
    }
} else {
    if ($hasCommits) {
        Write-Host "   ✓ You have commits to push" -ForegroundColor Green
    } else {
        Write-Host "   No new commits to push" -ForegroundColor Yellow
    }
}

# Check for uncommitted changes
Write-Host "`n5. Checking for uncommitted changes..." -ForegroundColor Yellow
$uncommitted = git status --porcelain
if ($uncommitted) {
    Write-Host "   You have uncommitted changes:" -ForegroundColor Yellow
    $uncommitted | ForEach-Object { Write-Host "   $_" -ForegroundColor Cyan }
    Write-Host "   Consider committing them first:" -ForegroundColor Yellow
    Write-Host "   git add ." -ForegroundColor Cyan
    Write-Host "   git commit -m 'Your commit message'" -ForegroundColor Cyan
} else {
    Write-Host "   ✓ No uncommitted changes" -ForegroundColor Green
}

# Try to push
Write-Host "`n6. Attempting to push..." -ForegroundColor Yellow
$pushOutput = git push 2>&1
$pushExitCode = $LASTEXITCODE

if ($pushExitCode -eq 0) {
    Write-Host "   ✓ Push successful!" -ForegroundColor Green
} else {
    Write-Host "   Push failed with error:" -ForegroundColor Red
    $pushOutput | ForEach-Object { Write-Host "   $_" -ForegroundColor Red }
    
    # Common fixes
    Write-Host "`n=== Common Solutions ===" -ForegroundColor Cyan
    
    if ($pushOutput -match "no upstream branch") {
        Write-Host "`nFix: Set upstream branch" -ForegroundColor Yellow
        Write-Host "   git push -u origin $currentBranch" -ForegroundColor Cyan
    }
    
    if ($pushOutput -match "authentication|permission|denied") {
        Write-Host "`nFix: Authentication issue" -ForegroundColor Yellow
        Write-Host "   - Check your credentials" -ForegroundColor Cyan
        Write-Host "   - Use: git config --global credential.helper wincred" -ForegroundColor Cyan
        Write-Host "   - Or set up SSH keys" -ForegroundColor Cyan
    }
    
    if ($pushOutput -match "rejected|non-fast-forward") {
        Write-Host "`nFix: Remote has changes you don't have" -ForegroundColor Yellow
        Write-Host "   git pull --rebase origin $currentBranch" -ForegroundColor Cyan
        Write-Host "   Then try pushing again" -ForegroundColor Cyan
    }
    
    if ($pushOutput -match "remote.*not found") {
        Write-Host "`nFix: Remote URL might be incorrect" -ForegroundColor Yellow
        Write-Host "   Check with: git remote -v" -ForegroundColor Cyan
        Write-Host "   Update with: git remote set-url origin <new-url>" -ForegroundColor Cyan
    }
}

Write-Host "`n=== Diagnostic Complete ===" -ForegroundColor Cyan
