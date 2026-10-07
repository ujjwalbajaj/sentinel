param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("bsc", "base")]
    [string]$Chain,

    [Parameter(Mandatory = $true)]
    [string]$Wallet,

    [Parameter(Mandatory = $true)]
    [string]$Action,

    [Parameter(Mandatory = $true)]
    [ValidateSet("before", "after")]
    [string]$Phase
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $root ".env"
$logPath = Join-Path $root "spend-log.csv"
$pendingDir = Join-Path $root ".spend-pending"

if (-not (Test-Path $envPath)) {
    Write-Error ".env not found at $envPath"
}

$vars = @{}
Get-Content $envPath | ForEach-Object {
    $line = $_.Trim()
    if ($line -eq "" -or $line.StartsWith("#")) { return }
    $idx = $line.IndexOf("=")
    if ($idx -lt 1) { return }
    $name = $line.Substring(0, $idx).Trim()
    $value = $line.Substring($idx + 1).Trim()
    if ($value -match '^(.*?)\s+#') { $value = $Matches[1].Trim() }
    $vars[$name] = $value
}

$cast = Get-Command cast -ErrorAction SilentlyContinue
if (-not $cast) {
    $fallback = Join-Path $env:USERPROFILE ".foundry\bin\cast.exe"
    if (Test-Path $fallback) { $cast = $fallback } else { Write-Error "cast was not found on PATH" }
} else {
    $cast = $cast.Source
}

$address = $Wallet
if ($Wallet -notmatch '^0x[a-fA-F0-9]{40}$') {
    $addressKey = "{0}_ADDRESS" -f $Wallet.ToUpperInvariant()
    $address = $vars[$addressKey]
    if ([string]::IsNullOrWhiteSpace($address)) {
        Write-Error "No address for wallet role $Wallet ($addressKey)"
    }
}

$rpcKey = if ($Chain -eq "bsc") { "BSC_RPC" } else { "BASE_RPC" }
$rpc = $vars[$rpcKey]
if ([string]::IsNullOrWhiteSpace($rpc)) {
    Write-Error "$rpcKey is empty"
}

$prev = $ErrorActionPreference
$ErrorActionPreference = "Continue"
$balanceOutput = & $cast balance $address --ether --rpc-url $rpc 2>$null
$code = $LASTEXITCODE
$ErrorActionPreference = $prev
$balance = ($balanceOutput | Out-String).Trim()
if ($code -ne 0 -or [string]::IsNullOrWhiteSpace($balance)) {
    Write-Error "Balance lookup failed on $Chain"
}

$safeAction = ($Action -replace '[^a-zA-Z0-9._-]', '_')
$pendingName = "{0}-{1}-{2}.json" -f $Chain, $address.ToLowerInvariant(), $safeAction
$pendingPath = Join-Path $pendingDir $pendingName

if ($Phase -eq "before") {
    New-Item -ItemType Directory -Force -Path $pendingDir | Out-Null
    $pending = @{
        timestamp     = [DateTime]::UtcNow.ToString("o")
        chain         = $Chain
        wallet        = $address
        action        = $Action
        balanceBefore = $balance
    } | ConvertTo-Json
    $utf8 = New-Object System.Text.UTF8Encoding $false
    [System.IO.File]::WriteAllText($pendingPath, $pending, $utf8)
    Write-Output ("before {0} {1} {2} {3}" -f $Chain, $address, $Action, $balance)
    return
}

if (-not (Test-Path $pendingPath)) {
    Write-Error "No before-snapshot for $Chain $address $Action. Run -Phase before first."
}

$pending = Get-Content $pendingPath -Raw | ConvertFrom-Json
if (-not (Test-Path $logPath)) {
    "timestamp,chain,wallet,action,balanceBefore,balanceAfter" | Set-Content -Path $logPath -Encoding utf8
}

function ConvertTo-CsvField([string]$value) {
    if ($value -match '[",\r\n]') { return '"' + ($value -replace '"', '""') + '"' }
    return $value
}

$row = @(
    (ConvertTo-CsvField $pending.timestamp),
    (ConvertTo-CsvField $pending.chain),
    (ConvertTo-CsvField $pending.wallet),
    (ConvertTo-CsvField $pending.action),
    (ConvertTo-CsvField $pending.balanceBefore),
    (ConvertTo-CsvField $balance)
) -join ","

Add-Content -Path $logPath -Value $row -Encoding utf8
Remove-Item $pendingPath -Force
Write-Output ("after {0} {1} {2} {3} -> {4}" -f $Chain, $address, $Action, $pending.balanceBefore, $balance)
