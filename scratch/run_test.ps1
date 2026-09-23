$edge = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
$outImg = "C:\Users\Shabab\.gemini\antigravity\brain\7a445903-ed32-46d6-b962-00fdb8a74571\scratch\selftest_result.png"
$targetUrl = "file:///C:/Users/Shabab/Downloads/G20 project/scratch/run_full_self_test.html"
$domOut = "C:\Users\Shabab\Downloads\G20 project\scratch\selftest_dom.html"

& $edge --headless=new --disable-gpu --virtual-time-budget=5000 "--screenshot=$outImg" --window-size=1280,1200 $targetUrl
$dom = & $edge --headless=new --disable-gpu --virtual-time-budget=5000 --dump-dom $targetUrl
$dom | Out-File -FilePath $domOut -Encoding utf8

Write-Host "Screenshot exists: $(Test-Path $outImg)"
Write-Host "DOM length: $($dom.Length)"
