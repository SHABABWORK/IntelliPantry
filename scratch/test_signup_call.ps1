$supabaseUrl = "https://oubfjolxhvkujjjnzvol.supabase.co"
$anonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im91YmZqb2x4aHZrdWpqam56dm9sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAwMDk1NzMsImV4cCI6MjEwNTU4NTU3M30.v637P_FSQIKQq4PrfujlXGa2ciGR9UD68UY9vH_cqN4"
$headers = @{
    "apikey" = $anonKey
    "Authorization" = "Bearer $anonKey"
    "Content-Type" = "application/json"
}

$rand = Get-Random -Minimum 1000 -Maximum 999999
$testEmail = "testpantry_$rand@gmail.com"
$body = @{
    email = $testEmail
    password = "Password123!"
} | ConvertTo-Json

Write-Host "Attempting signup for $testEmail"
try {
    $res = Invoke-RestMethod -Uri "$supabaseUrl/auth/v1/signup" -Headers $headers -Method POST -Body $body
    Write-Host "Response received:"
    $res | ConvertTo-Json -Depth 5
} catch {
    Write-Host "Error: $($_.Exception.Message)"
    if ($_.Exception.Response) {
        $stream = $_Exception.Response.GetResponseStream()
        $reader = New-Object System.IO.StreamReader($stream)
        Write-Host "Body: $($reader.ReadToEnd())"
    }
}
