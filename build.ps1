# PowerShell build script for Smart Pantry
Write-Host "[Build] Generating Smart Pantry dist bundle..."

$root = $PSScriptRoot
if (-not $root) { $root = Get-Location }

$dist = Join-Path $root "dist"

if (Test-Path $dist) {
    Remove-Item -Recurse -Force $dist
}

New-Item -ItemType Directory -Force -Path $dist | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $dist "css") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $dist "js") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $dist "assets") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $dist "netlify\functions") | Out-Null

Copy-Item (Join-Path $root "landing.html") (Join-Path $dist "index.html") -Force
Copy-Item (Join-Path $root "landing.html") (Join-Path $dist "landing.html") -Force
Copy-Item (Join-Path $root "login.html") (Join-Path $dist "login.html") -Force
Copy-Item (Join-Path $root "index.html") (Join-Path $dist "dashboard.html") -Force

if (Test-Path (Join-Path $root "netlify.toml")) {
    Copy-Item (Join-Path $root "netlify.toml") (Join-Path $dist "netlify.toml") -Force
}
if (Test-Path (Join-Path $root "vercel.json")) {
    Copy-Item (Join-Path $root "vercel.json") (Join-Path $dist "vercel.json") -Force
}

$redirects = "/api/*  /.netlify/functions/:splat  200`n/*      /index.html                 200`n"
Set-Content -Path (Join-Path $dist "_redirects") -Value $redirects -Encoding UTF8

$robots = "User-agent: *`nAllow: /`n"
Set-Content -Path (Join-Path $dist "robots.txt") -Value $robots -Encoding UTF8

Copy-Item -Recurse (Join-Path $root "css\*") (Join-Path $dist "css") -Force
Copy-Item -Recurse (Join-Path $root "js\*") (Join-Path $dist "js") -Force
Copy-Item -Recurse (Join-Path $root "assets\*") (Join-Path $dist "assets") -Force
Copy-Item -Recurse (Join-Path $root "netlify\*") (Join-Path $dist "netlify") -Force
$public = Join-Path $root "public"
if (Test-Path $public) { Remove-Item -Recurse -Force $public }
Copy-Item -Recurse -Force $dist $public

# Create deployment zip with POSIX compliant paths
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zipPath = Join-Path $root "smartpantry-deploy.zip"
if (Test-Path $zipPath) {
    Remove-Item $zipPath -Force
}
[System.IO.Compression.ZipFile]::CreateFromDirectory($dist, $zipPath)

Write-Host "[Build] SUCCESS: Zip created at: $zipPath"
