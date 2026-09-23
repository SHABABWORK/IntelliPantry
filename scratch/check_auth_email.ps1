$supabaseUrl = "https://oubfjolxhvkujjjnzvol.supabase.co"
$anonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im91YmZqb2x4aHZrdWpqam56dm9sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAwMDk1NzMsImV4cCI6MjEwNTU4NTU3M30.v637P_FSQIKQq4PrfujlXGa2ciGR9UD68UY9vH_cqN4"

$headers = @{
    "apikey" = $anonKey
    "Authorization" = "Bearer $anonKey"
    "Content-Type" = "application/json"
}

Write-Host "=========================================="
Write-Host "SUPABASE AUTH / SETTINGS CONFIGURATION"
Write-Host "=========================================="
try {
    $settings = Invoke-RestMethod -Uri "$supabaseUrl/auth/v1/settings" -Headers $headers -Method GET
    $settings | ConvertTo-Json -Depth 5
} catch {
    Write-Host "Error: $($_.Exception.Message)"
}
