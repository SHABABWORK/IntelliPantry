$edge = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
$outFile = Join-Path $PSScriptRoot "email_test_output.html"
$url = "file:///" + (Join-Path $PSScriptRoot "test_all_email_services.html").Replace('\', '/').Replace(' ', '%20')

$tempDir = Join-Path $env:TEMP "edge_email_profile_$([Guid]::NewGuid().ToString())"
New-Item -ItemType Directory -Force -Path $tempDir | Out-Null

$edgeArgs = @(
    '--headless=new',
    '--disable-gpu',
    "--user-data-dir=$tempDir",
    '--allow-file-access-from-files',
    '--virtual-time-budget=6000',
    '--dump-dom',
    $url
)

if (Test-Path $outFile) { Remove-Item $outFile -Force }

$proc = Start-Process -FilePath $edge -ArgumentList $edgeArgs -NoNewWindow -Wait -RedirectStandardOutput $outFile -PassThru

if (Test-Path $outFile) {
    $content = Get-Content $outFile -Raw
    Write-Host "Output length: $($content.Length)"
    if ($content -match '<div id="summary">(.+?)</div>') {
        Write-Host "Summary: $($Matches[1])"
    }
    if ($content -match 'ALL EMAIL TESTS PASSED') {
        Write-Host "SUCCESS: ALL EMAIL TESTS PASSED!"
    } else {
        Write-Host "Checking result..."
        $content | Select-String -Pattern 'FAIL|PASS' -AllMatches | ForEach-Object { $_.Line }
    }
} else {
    Write-Host "No output file produced."
}
