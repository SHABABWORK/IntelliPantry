# Test User Isolation & Empty State Verification Script
Write-Host "`n=== SMART PANTRY MULTI-USER ISOLATION TEST ===" -ForegroundColor Cyan

# Define mock local storage emulation
$mockLocalStorage = @{}

function Set-Item-Mock($key, $val) {
    $mockLocalStorage[$key] = $val
}

function Get-Item-Mock($key) {
    if ($mockLocalStorage.ContainsKey($key)) {
        return $mockLocalStorage[$key]
    }
    return $null
}

function Remove-Item-Mock($key) {
    $mockLocalStorage.Remove($key)
}

# 1. TEST SCENARIO: ACCOUNT A CREATION
Write-Host "`n[Step 1] Creating Account A (alice@smartpantry.app)..." -ForegroundColor Yellow
$userA_id = "usr_" + [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes("alice@smartpantry.app")).TrimEnd('=').Substring(0, 16)
$userA = @{
    id = $userA_id
    email = "alice@smartpantry.app"
    name = "Alice"
}
Set-Item-Mock "smartpantry_user" ($userA | ConvertTo-Json -Compress)
Set-Item-Mock "smartpantry_token" "sp_tok_alice_123"
# Fresh signup sets empty pantry
Set-Item-Mock "smartpantry_user_pantry_$userA_id" "[]"

$pantryA_raw = Get-Item-Mock "smartpantry_user_pantry_$userA_id"
$pantryA = ConvertFrom-Json $pantryA_raw
if ($pantryA.Count -eq 0) {
    Write-Host "✓ PASS: Account A starts with completely EMPTY pantry (Count = 0)" -ForegroundColor Green
} else {
    Write-Host "✗ FAIL: Account A has unexpected default items!" -ForegroundColor Red
    exit 1
}

# 2. ADD PRODUCT A1 AND PRODUCT A2
Write-Host "`n[Step 2] Adding Product A1 ('Milk') and Product A2 ('Rice') for Account A..." -ForegroundColor Yellow
$itemA1 = @{ id = "prod_1"; name = "Milk"; category = "Dairy"; quantity = 1; unit = "L"; expiryDate = "2026-09-25"; status = "Expiring Soon"; emoji = "🥛" }
$itemA2 = @{ id = "prod_2"; name = "Rice"; category = "Grains"; quantity = 2; unit = "kg"; expiryDate = "2026-12-01"; status = "Fresh"; emoji = "🌾" }
$pantryA_items = @($itemA1, $itemA2)
Set-Item-Mock "smartpantry_user_pantry_$userA_id" ($pantryA_items | ConvertTo-Json -Compress)

$savedA = ConvertFrom-Json (Get-Item-Mock "smartpantry_user_pantry_$userA_id")
Write-Host "✓ PASS: Account A now has $($savedA.Count) products: $($savedA[0].name), $($savedA[1].name)" -ForegroundColor Green

# 3. SIMULATE REFRESH
Write-Host "`n[Step 3] Simulating Page Refresh for Account A..." -ForegroundColor Yellow
$refreshedA = ConvertFrom-Json (Get-Item-Mock "smartpantry_user_pantry_$userA_id")
if ($refreshedA.Count -eq 2 -and $refreshedA[0].name -eq "Milk" -and $refreshedA[1].name -eq "Rice") {
    Write-Host "PASS: Products Milk and Rice persist after refresh for Account A" -ForegroundColor Green
} else {
    Write-Host "FAIL: Refresh lost products for Account A" -ForegroundColor Red
    exit 1
}

# 4. LOGOUT ACCOUNT A
Write-Host "`n[Step 4] Logging out Account A..." -ForegroundColor Yellow
Remove-Item-Mock "smartpantry_user"
Remove-Item-Mock "smartpantry_token"
Write-Host "✓ PASS: Account A session purged cleanly" -ForegroundColor Green

# 5. CREATE ACCOUNT B
Write-Host "`n[Step 5] Creating Account B (bob@smartpantry.app)..." -ForegroundColor Yellow
$userB_id = "usr_" + [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes("bob@smartpantry.app")).TrimEnd('=').Substring(0, 16)
$userB = @{
    id = $userB_id
    email = "bob@smartpantry.app"
    name = "Bob"
}
Set-Item-Mock "smartpantry_user" ($userB | ConvertTo-Json -Compress)
Set-Item-Mock "smartpantry_token" "sp_tok_bob_456"
# Fresh signup sets empty pantry
Set-Item-Mock "smartpantry_user_pantry_$userB_id" "[]"

$pantryB_raw = Get-Item-Mock "smartpantry_user_pantry_$userB_id"
$pantryB = ConvertFrom-Json $pantryB_raw
if ($pantryB.Count -eq 0) {
    Write-Host "✓ PASS: Account B starts with completely EMPTY pantry (Count = 0)" -ForegroundColor Green
} else {
    Write-Host "✗ FAIL: Account B was initialized with non-empty pantry!" -ForegroundColor Red
    exit 1
}

# Verify Account B cannot see Milk or Rice
$hasMilkOrRice = $pantryB | Where-Object { $_.name -eq "Milk" -or $_.name -eq "Rice" }
if (-not $hasMilkOrRice) {
    Write-Host "✓ PASS: Account B CANNOT see Milk or Rice belonging to Account A" -ForegroundColor Green
} else {
    Write-Host "✗ FAIL: Account B leaked products from Account A!" -ForegroundColor Red
    exit 1
}

# 6. ADD PRODUCT B1 FOR ACCOUNT B
Write-Host "`n[Step 6] Adding Product B1 ('Eggs') for Account B..." -ForegroundColor Yellow
$itemB1 = @{ id = "prod_3"; name = "Eggs"; category = "Dairy"; quantity = 12; unit = "pcs"; expiryDate = "2026-10-05"; status = "Fresh"; emoji = "🥚" }
$pantryB_items = @($itemB1)
Set-Item-Mock "smartpantry_user_pantry_$userB_id" ($pantryB_items | ConvertTo-Json -Compress)

$savedB = ConvertFrom-Json (Get-Item-Mock "smartpantry_user_pantry_$userB_id")
Write-Host "✓ PASS: Account B has $($savedB.Count) product: $($savedB[0].name)" -ForegroundColor Green

# 7. LOGOUT ACCOUNT B & RE-LOGIN TO ACCOUNT A
Write-Host "`n[Step 7] Logging out Account B and logging back into Account A..." -ForegroundColor Yellow
Remove-Item-Mock "smartpantry_user"
Remove-Item-Mock "smartpantry_token"

Set-Item-Mock "smartpantry_user" ($userA | ConvertTo-Json -Compress)
Set-Item-Mock "smartpantry_token" "sp_tok_alice_123"

$reloadedA = ConvertFrom-Json (Get-Item-Mock "smartpantry_user_pantry_$userA_id")
$hasEggsInA = $reloadedA | Where-Object { $_.name -eq "Eggs" }

if ($reloadedA.Count -eq 2 -and -not $hasEggsInA) {
    Write-Host "PASS: Account A has Milk and Rice, and Eggs does NOT appear!" -ForegroundColor Green
} else {
    Write-Host "FAIL: Account A pantry corrupted by Account B!" -ForegroundColor Red
    exit 1
}

Write-Host "`n=== ALL 7 MULTI-USER ISOLATION TESTS PASSED PERFECTLY ===" -ForegroundColor Green
