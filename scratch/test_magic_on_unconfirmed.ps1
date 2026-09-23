$supabaseUrl = "https://oubfjolxhvkujjjnzvol.supabase.co"
$anonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im91YmZqb2x4aHZrdWpqam56dm9sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAwMDk1NzMsImV4cCI6MjEwNTU4NTU3M30.v637P_FSQIKQq4PrfujlXGa2ciGR9UD68UY9vH_cqN4"
$headers = @{
    "apikey" = $anonKey
    "Authorization" = "Bearer $anonKey"
    "Content-Type" = "application/json"
}

$rand = Get-Random -Minimum 1000 -Maximum 999999
$testEmail = "testpantry_magic_$rand@gmail.com"

Write-Host "1. Signing up user: $testEmail"
$signupBody = @{
    email = $testEmail
    password = "SecurePassword123!"
} | ConvertTo-Json

try {
    $res1 = Invoke-RestMethod -Uri "$supabaseUrl/auth/v1/signup" -Headers $headers -Method POST -Body $signupBody
    Write-Host "Signup succeeded. User ID: $($res1.id)"
} catch {
    Write-Host "Signup error: $($_.Exception.Message)"
}

Write-Host "`n2. Requesting OTP / Magic Link for the same user: $testEmail"
$otpBody = @{
    email = $testEmail
} | ConvertTo-Json

try {
    $res2 = Invoke-RestMethod -Uri "$supabaseUrl/auth/v1/otp" -Headers $headers -Method POST -Body $otpBody
    Write-Host "OTP request succeeded! Response:"
    $res2 | ConvertTo-Json
} catch {
    Write-Host "OTP request error: $($_.Exception.Message)"
}
