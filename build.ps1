# PowerShell build script for Smart Pantry
Write-Host "[Build] Generating Smart Pantry Vercel bundle..."

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
New-Item -ItemType Directory -Force -Path (Join-Path $dist "api") | Out-Null

Copy-Item (Join-Path $root "dashboard.html") (Join-Path $dist "index.html") -Force
Copy-Item (Join-Path $root "landing.html") (Join-Path $dist "landing.html") -Force
Copy-Item (Join-Path $root "login.html") (Join-Path $dist "login.html") -Force
Copy-Item (Join-Path $root "dashboard.html") (Join-Path $dist "dashboard.html") -Force

if (Test-Path (Join-Path $root "vercel.json")) {
    Copy-Item (Join-Path $root "vercel.json") (Join-Path $dist "vercel.json") -Force
}
if (Test-Path (Join-Path $root "supabase_schema.sql")) {
    Copy-Item (Join-Path $root "supabase_schema.sql") (Join-Path $dist "supabase_schema.sql") -Force
}
if (Test-Path (Join-Path $root ".env.example")) {
    Copy-Item (Join-Path $root ".env.example") (Join-Path $dist ".env.example") -Force
}
if (Test-Path (Join-Path $root "README.md")) {
    Copy-Item (Join-Path $root "README.md") (Join-Path $dist "README.md") -Force
}
if (Test-Path (Join-Path $root "build.js")) {
    Copy-Item (Join-Path $root "build.js") (Join-Path $dist "build.js") -Force
}
if (Test-Path (Join-Path $root "supabase")) {
    Copy-Item -Recurse (Join-Path $root "supabase") (Join-Path $dist "supabase") -Force
}

$robots = "User-agent: *`nAllow: /`n"
Set-Content -Path (Join-Path $dist "robots.txt") -Value $robots -Encoding UTF8

Copy-Item -Recurse (Join-Path $root "css\*") (Join-Path $dist "css") -Force
Copy-Item -Recurse (Join-Path $root "js\*") (Join-Path $dist "js") -Force
Copy-Item -Recurse (Join-Path $root "assets\*") (Join-Path $dist "assets") -Force
if (Test-Path (Join-Path $root "api")) {
    Copy-Item -Recurse (Join-Path $root "api\*") (Join-Path $dist "api") -Force
}

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

Write-Host "[Build] SUCCESS: Vercel bundle and Zip created at: $zipPath"
