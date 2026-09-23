$supabaseUrl = "https://oubfjolxhvkujjjnzvol.supabase.co"
$anonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im91YmZqb2x4aHZrdWpqam56dm9sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAwMDk1NzMsImV4cCI6MjEwNTU4NTU3M30.v637P_FSQIKQq4PrfujlXGa2ciGR9UD68UY9vH_cqN4"

$headers = @{
    "apikey" = $anonKey
    "Authorization" = "Bearer $anonKey"
    "Content-Type" = "application/json"
}

Write-Host "=========================================="
Write-Host "TESTING SUPABASE EMAIL AUTH ENDPOINTS"
Write-Host "=========================================="

# Test 1: Password Reset / Recover Email
$testEmail = "intellipantrynotify@gmail.com"
Write-Host "`n1. Testing Reset Password Email Endpoint (POST /auth/v1/recover)..."
try {
    $body = @{
        email = $testEmail
    } | ConvertTo-Json
    $res = Invoke-RestMethod -Uri "$supabaseUrl/auth/v1/recover" -Headers $headers -Method POST -Body $body
    Write-Host "[RECOVER] SUCCESS: Endpoint accepted request and triggered recovery email to $testEmail."
    $res | ConvertTo-Json
} catch {
    $status = $_.Exception.Response.StatusCode.value__
    $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
    $errBody = $reader.ReadToEnd()
    Write-Host "[RECOVER] Response ($status): $errBody"
}

# Test 2: Magic Link / OTP Endpoint (POST /auth/v1/otp)
Write-Host "`n2. Testing Magic Link / OTP Endpoint (POST /auth/v1/otp)..."
try {
    $body = @{
        email = $testEmail
        create_user = $false
    } | ConvertTo-Json
    $res = Invoke-RestMethod -Uri "$supabaseUrl/auth/v1/otp" -Headers $headers -Method POST -Body $body
    Write-Host "[OTP] SUCCESS: Endpoint accepted request and triggered OTP email to $testEmail."
    $res | ConvertTo-Json
} catch {
    $status = $_.Exception.Response.StatusCode.value__
    $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
    $errBody = $reader.ReadToEnd()
    Write-Host "[OTP] Response ($status): $errBody"
}

# Test 3: Resend Signup Confirmation (POST /auth/v1/resend)
Write-Host "`n3. Testing Resend Signup Confirmation (POST /auth/v1/resend)..."
try {
    $body = @{
        type = "signup"
        email = $testEmail
    } | ConvertTo-Json
    $res = Invoke-RestMethod -Uri "$supabaseUrl/auth/v1/resend" -Headers $headers -Method POST -Body $body
    Write-Host "[RESEND] SUCCESS: Endpoint accepted resend request for $testEmail."
    $res | ConvertTo-Json
} catch {
    $status = $_.Exception.Response.StatusCode.value__
    $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
    $errBody = $reader.ReadToEnd()
    Write-Host "[RESEND] Response ($status): $errBody"
}
