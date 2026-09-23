$edge = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
$outFile = Join-Path $PSScriptRoot "e2e_output.html"
$url = "file:///" + (Join-Path $PSScriptRoot "e2e_comprehensive_self_test.html").Replace('\', '/').Replace(' ', '%20')

$tempDir = Join-Path $env:TEMP "edge_e2e_profile_$([Guid]::NewGuid().ToString())"
New-Item -ItemType Directory -Force -Path $tempDir | Out-Null

$edgeArgs = @(
    '--headless=new',
    '--disable-gpu',
    "--user-data-dir=$tempDir",
    '--allow-file-access-from-files',
    '--virtual-time-budget=8000',
    '--dump-dom',
    $url
)

if (Test-Path $outFile) { Remove-Item $outFile -Force }

$proc = Start-Process -FilePath $edge -ArgumentList $edgeArgs -NoNewWindow -Wait -RedirectStandardOutput $outFile -PassThru

if (Test-Path $outFile) {
    $content = Get-Content $outFile -Raw
    Write-Host "Output length: $($content.Length)"
    if ($content -match '<div id="summary".*?>([\s\S]*?)<\/div>') {
        $summaryText = $Matches[1] -replace '<[^>]+>', ' ' -replace '\s+', ' '
        Write-Host "Summary: $summaryText"
    }
    if ($content -match 'ALL E2E TESTS PASSED') {
        Write-Host "SUCCESS: ALL E2E TESTS PASSED!"
    } else {
        Write-Host "Checking result details..."
        $content | Select-String -Pattern 'badge-pass|badge-fail|FAIL|PASS' -AllMatches | ForEach-Object { $_.Line.Trim() }
    }
} else {
    Write-Host "No output file produced."
}
