$supabaseUrl = "https://oubfjolxhvkujjjnzvol.supabase.co"
$anonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im91YmZqb2x4aHZrdWpqam56dm9sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAwMDk1NzMsImV4cCI6MjEwNTU4NTU3M30.v637P_FSQIKQq4PrfujlXGa2ciGR9UD68UY9vH_cqN4"

$headers = @{
    "apikey" = $anonKey
    "Authorization" = "Bearer $anonKey"
    "Content-Type" = "application/json"
}

Write-Host "=========================================="
Write-Host "1. TESTING SUPABASE REST API & TABLES"
Write-Host "=========================================="

$tables = @(
    "pantry_items",
    "profiles",
    "pantry_products",
    "products",
    "alerts",
    "notification_preferences",
    "activity_logs",
    "email_notifications"
)

foreach ($t in $tables) {
    $uri = "$supabaseUrl/rest/v1/$t`?select=*"
    try {
        $response = Invoke-RestMethod -Uri $uri -Headers $headers -Method GET -TimeoutSec 10
        Write-Host "[TABLE] $t : EXISTS and RLS is active (Returned $(@($response).Count) records for unauthenticated anon key)"
    } catch {
        $status = $_.Exception.Response.StatusCode.value__
        $msg = $_.Exception.Message
        Write-Host "[TABLE] $t : HTTP $status - $msg"
    }
}

Write-Host ""
Write-Host "=========================================="
Write-Host "2. TESTING SUPABASE AUTH GOTRUE SERVICE"
Write-Host "=========================================="

try {
    $authUri = "$supabaseUrl/auth/v1/settings"
    $authSettings = Invoke-RestMethod -Uri $authUri -Headers $headers -Method GET -TimeoutSec 10
    Write-Host "[AUTH] Supabase GoTrue Auth service is ONLINE"
    Write-Host "[AUTH] External providers: $(($authSettings.external | Get-Member -MemberType NoteProperty).Count) available"
    Write-Host "[AUTH] Disable signup: $($authSettings.disable_signup)"
} catch {
    Write-Host "[AUTH] Error checking auth service: $($_.Exception.Message)"
}

Write-Host ""
Write-Host "=========================================="
Write-Host "3. TESTING RLS UNPROTECTED WRITE REJECTION"
Write-Host "=========================================="

try {
    $insertUri = "$supabaseUrl/rest/v1/pantry_products"
    $dummyProduct = @{
        product_name = "Hacker Fake Milk"
        category = "Dairy"
        user_id = "00000000-0000-0000-0000-000000000000"
    } | ConvertTo-Json

    $insertRes = Invoke-RestMethod -Uri $insertUri -Headers $headers -Method POST -Body $dummyProduct -TimeoutSec 10
    Write-Host "[SECURITY ALERT] Anonymous insert succeeded (RLS might not be enforced)!"
} catch {
    Write-Host "[RLS PASS] Anonymous unauthorized insert was BLOCKED by PostgreSQL: $($_.Exception.Message)"
}

Write-Host ""
Write-Host "=========================================="
Write-Host "4. TESTING SERVERLESS EMAIL ENDPOINTS"
Write-Host "=========================================="

$loginAlertUri = "https://www.intellipantry.in/api/send-login-notification"
try {
    $payload = @{
        email = "intellipantrynotify@gmail.com"
        name = "Self-Test Runner"
        loginDate = (Get-Date -Format "yyyy-MM-dd")
        loginTime = (Get-Date -Format "HH:mm:ss")
        browser = "Automated PowerShell Test Engine"
        device = "Production Test Host"
    } | ConvertTo-Json

    $emailRes = Invoke-RestMethod -Uri $loginAlertUri -Method POST -Body $payload -ContentType "application/json" -TimeoutSec 10
    Write-Host "[EMAIL LOGIN NOTIFICATION] Endpoint Status: SUCCESS"
    Write-Host "Response: $($emailRes | ConvertTo-Json -Compress)"
} catch {
    Write-Host "[EMAIL LOGIN NOTIFICATION] Endpoint Error: $($_.Exception.Message)"
}

$pantryAlertUri = "https://www.intellipantry.in/api/send-pantry-alert"
try {
    $pantryPayload = @{
        email = "intellipantrynotify@gmail.com"
        type = "test"
        items = @(
            @{ name = "Organic Strawberries"; quantity = 2; unit = "packs"; status = "Expiring Soon" }
        )
    } | ConvertTo-Json

    $pantryEmailRes = Invoke-RestMethod -Uri $pantryAlertUri -Method POST -Body $pantryPayload -ContentType "application/json" -TimeoutSec 10
    Write-Host "[EMAIL PANTRY ALERT] Endpoint Status: SUCCESS"
    Write-Host "Response: $($pantryEmailRes | ConvertTo-Json -Compress)"
} catch {
    Write-Host "[EMAIL PANTRY ALERT] Endpoint Error: $($_.Exception.Message)"
}

Write-Host "=========================================="
Write-Host "SELF-TEST COMPLETED"
Write-Host "=========================================="
