param([switch]$RunOnce, [switch]$DryRun)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$configPath = Join-Path $PSScriptRoot "OverdueBaleJob.json"
if (-not (Test-Path -LiteralPath $configPath)) {
    throw "Config file not found: $configPath. Copy OverdueBaleJob.example.json to OverdueBaleJob.json."
}
$config = Get-Content -LiteralPath $configPath -Raw -Encoding UTF8 | ConvertFrom-Json
$apiUrl = [string]$config.ApiUrl
$apiKey = [string]$config.ApiKey
$runHour = [int]$config.RunHour
$retryMinutes = [int]$config.RetryMinutes

if ([string]::IsNullOrWhiteSpace($apiUrl)) { throw "ApiUrl is empty in OverdueBaleJob.json." }
if ([string]::IsNullOrWhiteSpace($apiKey) -or $apiKey.Length -lt 32 -or $apiKey -match "REPLACE|CHANGE_ME") { throw "Set a strong ApiKey in OverdueBaleJob.json." }
if ($runHour -lt 0 -or $runHour -gt 23) { throw "RunHour must be between 0 and 23." }
if ($retryMinutes -lt 1) { $retryMinutes = 5 }

$logDirectory = Join-Path $env:ProgramData "Vezarati\Logs"
$null = New-Item -ItemType Directory -Path $logDirectory -Force
$script:logPath = Join-Path $logDirectory "daily-overdue-bale.log"

function Write-JobLog([string]$message) {
    $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $message"
    Add-Content -LiteralPath $script:logPath -Value $line -Encoding UTF8
}

function Invoke-OverdueJob([bool]$dryRun = $false) {
    Write-JobLog "Daily overdue check request sent. Dry run: $dryRun"
    $requestBody = @{ dryRun = $dryRun } | ConvertTo-Json -Compress
    $response = Invoke-RestMethod -Uri $apiUrl -Method Post -Headers @{ "X-Job-Key" = $apiKey } -ContentType "application/json" -Body $requestBody -TimeoutSec 180
    $summary = $response | ConvertTo-Json -Depth 5 -Compress
    Write-JobLog "Result: $summary"
}

if ($RunOnce) {
    Invoke-OverdueJob -dryRun ([bool]$DryRun)
    exit 0
}

Write-JobLog "Scheduler started. Daily run hour: $($runHour.ToString('00')):00."
$lastSuccessfulDate = ""
while ($true) {
    $now = Get-Date
    $today = $now.ToString("yyyy-MM-dd")
    if ($now.Hour -ge $runHour -and $lastSuccessfulDate -ne $today) {
        try {
            Invoke-OverdueJob
            $lastSuccessfulDate = $today
        }
        catch {
            Write-JobLog "Daily job failed: $($_.Exception.Message). Retrying in $retryMinutes minute(s)."
            Start-Sleep -Seconds ($retryMinutes * 60)
            continue
        }
    }
    Start-Sleep -Seconds 60
}
