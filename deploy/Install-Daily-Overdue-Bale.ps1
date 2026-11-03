# PowerShell را با دسترسی Administrator باز کنید و این فایل را اجرا کنید.
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$taskName = "Vezarati-Daily-Overdue-Bale"
$runnerPath = Join-Path $PSScriptRoot "Run-Daily-Overdue-Bale.ps1"
$configPath = Join-Path $PSScriptRoot "OverdueBaleJob.json"

if (-not (Test-Path -LiteralPath $runnerPath)) { throw "فایل اجرا پیدا نشد: $runnerPath" }
if (-not (Test-Path -LiteralPath $configPath)) { throw "ابتدا OverdueBaleJob.example.json را به OverdueBaleJob.json کپی و تنظیم کنید." }
$config = Get-Content -LiteralPath $configPath -Raw -Encoding UTF8 | ConvertFrom-Json
if ([string]::IsNullOrWhiteSpace([string]$config.ApiKey) -or ([string]$config.ApiKey).Length -lt 32 -or [string]$config.ApiKey -match "REPLACE|CHANGE_ME") { throw "ApiKey در OverdueBaleJob.json تنظیم نشده است." }

$actionArguments = '-NoProfile -ExecutionPolicy Bypass -File "' + $runnerPath + '"'
$action = New-ScheduledTaskAction -Execute "PowerShell.exe" -Argument $actionArguments -WorkingDirectory $PSScriptRoot
$trigger = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 5) -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description "ارسال روزانهٔ یادآوری وظایف عقب‌افتادهٔ پیگیری مصوبات از طریق API و صف بله" -Force | Out-Null
Start-ScheduledTask -TaskName $taskName
Write-Host "کار زمان‌بندی‌شدهٔ $taskName ثبت و اجرا شد."
Write-Host "گزارش اجرا: $env:ProgramData\Vezarati\Logs\daily-overdue-bale.log"
