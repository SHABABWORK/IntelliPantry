$supabaseUrl = "https://oubfjolxhvkujjjnzvol.supabase.co"
$anonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im91YmZqb2x4aHZrdWpqam56dm9sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAwMDk1NzMsImV4cCI6MjEwNTU4NTU3M30.v637P_FSQIKQq4PrfujlXGa2ciGR9UD68UY9vH_cqN4"
$headers = @{
    "apikey" = $anonKey
    "Authorization" = "Bearer $anonKey"
    "Content-Type" = "application/json"
}

$rand = Get-Random -Minimum 1000 -Maximum 999999
$email = "newuser_test_$rand@gmail.com"
$pwd = "TestPass123!Safe"

Write-Host "--- STEP 1: SIGNUP ---"
$signupRes = Invoke-RestMethod -Uri "$supabaseUrl/auth/v1/signup" -Headers $headers -Method POST -Body (@{
    email = $email
    password = $pwd
} | ConvertTo-Json)

Write-Host "Created User ID: $($signupRes.id), Confirmation Sent At: $($signupRes.confirmation_sent_at)"

Write-Host "`n--- STEP 2: DISPATCH OTP (PROVEN WORKING SERVICE) ---"
$otpRes = Invoke-RestMethod -Uri "$supabaseUrl/auth/v1/otp" -Headers $headers -Method POST -Body (@{
    email = $email
} | ConvertTo-Json)
Write-Host "OTP dispatched successfully without error."

Write-Host "`n--- STEP 3: ATTEMPT PASSWORD LOGIN BEFORE CONFIRMATION ---"
try {
    $loginRes = Invoke-RestMethod -Uri "$supabaseUrl/auth/v1/token?grant_type=password" -Headers $headers -Method POST -Body (@{
        email = $email
        password = $pwd
    } | ConvertTo-Json)
    Write-Host "Password login result: SUCCESS (Direct session)"
} catch {
    $stream = $_.Exception.Response.GetResponseStream()
    $reader = New-Object System.IO.StreamReader($stream)
    Write-Host "Expected unconfirmed error: $($reader.ReadToEnd())"
}
