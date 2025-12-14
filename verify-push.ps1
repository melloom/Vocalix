# Verify Git Push Status
Write-Host "=== Verifying Git Push Status ===" -ForegroundColor Cyan

Write-Host "`nCurrent branch:" -ForegroundColor Yellow
git branch --show-current

Write-Host "`nLocal commits (last 3):" -ForegroundColor Yellow
git log --oneline -3

Write-Host "`nRemote URL:" -ForegroundColor Yellow
git remote get-url origin

Write-Host "`nAttempting to push..." -ForegroundColor Yellow
$output = git push --force origin main 2>&1
$exitCode = $LASTEXITCODE

if ($exitCode -eq 0) {
    Write-Host "✓ Push successful!" -ForegroundColor Green
} else {
    Write-Host "Push output:" -ForegroundColor Red
    $output
    Write-Host "Exit code: $exitCode" -ForegroundColor Red
}

Write-Host "`n=== Done ===" -ForegroundColor Cyan
