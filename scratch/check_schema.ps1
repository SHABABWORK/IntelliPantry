$u = "https://oubfjolxhvkujjjnzvol.supabase.co/rest/v1/"
$k = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im91YmZqb2x4aHZrdWpqam56dm9sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAwMDk1NzMsImV4cCI6MjEwNTU4NTU3M30.v637P_FSQIKQq4PrfujlXGa2ciGR9UD68UY9vH_cqN4"
$h = @{
    "apikey" = $k
    "Authorization" = "Bearer $k"
}

try {
    $res = Invoke-RestMethod -Uri $u -Headers $h -Method GET -TimeoutSec 10
    Write-Host "Swagger Title: $($res.info.title)"
    Write-Host "Tables / Definitions found:"
    if ($res.definitions) {
        $res.definitions.PSObject.Properties.Name | ForEach-Object { Write-Host " - $_" }
    } else {
        Write-Host "No definitions found in public schema."
    }
} catch {
    Write-Host "Error: $($_.Exception.Message)"
}
