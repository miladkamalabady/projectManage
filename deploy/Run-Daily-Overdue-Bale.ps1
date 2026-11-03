param([switch]$RunOnce, [switch]$DryRun)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$configPath = Join-Path $PSScriptRoot "OverdueBaleJob.json"
if (-not (Test-Path -LiteralPath $configPath)) {
    throw "فایل تنظیمات پیدا نشد: $configPath (از فایل نمونه یک کپی با نام OverdueBaleJob.json بسازید)"
}
$config = Get-Content -LiteralPath $configPath -Raw -Encoding UTF8 | ConvertFrom-Json
$apiUrl = [string]$config.ApiUrl
$apiKey = [string]$config.ApiKey
$runHour = [int]$config.RunHour
$retryMinutes = [int]$config.RetryMinutes

if ([string]::IsNullOrWhiteSpace($apiUrl)) { throw "ApiUrl در OverdueBaleJob.json خالی است." }
if ([string]::IsNullOrWhiteSpace($apiKey) -or $apiKey.Length -lt 32 -or $apiKey -match "REPLACE|CHANGE_ME") { throw "ApiKey را در OverdueBaleJob.json تنظیم کنید." }
if ($runHour -lt 0 -or $runHour -gt 23) { throw "RunHour باید بین 0 و 23 باشد." }
if ($retryMinutes -lt 1) { $retryMinutes = 5 }

$logDirectory = Join-Path $env:ProgramData "Vezarati\Logs"
$null = New-Item -ItemType Directory -Path $logDirectory -Force
$script:logPath = Join-Path $logDirectory "daily-overdue-bale.log"

function Write-JobLog([string]$message) {
    $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $message"
    Add-Content -LiteralPath $script:logPath -Value $line -Encoding UTF8
}

function Invoke-OverdueJob([bool]$dryRun = $false) {
    Write-JobLog "درخواست بررسی روزانهٔ وظایف عقب‌افتاده ارسال شد. حالت آزمایشی: $dryRun"
    $requestBody = @{ dryRun = $dryRun } | ConvertTo-Json -Compress
    $response = Invoke-RestMethod -Uri $apiUrl -Method Post -Headers @{ "X-Job-Key" = $apiKey } -ContentType "application/json" -Body $requestBody -TimeoutSec 180
    $summary = $response | ConvertTo-Json -Depth 5 -Compress
    Write-JobLog "نتیجه: $summary"
}

if ($RunOnce) {
    Invoke-OverdueJob -dryRun ([bool]$DryRun)
    exit 0
}

Write-JobLog "سرویس زمان‌بندی شروع شد؛ ساعت اجرا: $($runHour.ToString('00')):00."
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
            Write-JobLog "خطا در اجرای کار روزانه: $($_.Exception.Message)؛ تلاش مجدد تا $retryMinutes دقیقهٔ دیگر."
            Start-Sleep -Seconds ($retryMinutes * 60)
            continue
        }
    }
    Start-Sleep -Seconds 60
}
