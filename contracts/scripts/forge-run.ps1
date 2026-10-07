param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("bsc", "base")]
    [string]$Chain,

    [Parameter(Mandatory = $true)]
    [ValidateSet("Deploy", "Allowlist", "Onboard", "Seed", "Reset", "Rescue", "SetForwarder", "LockWorkflow")]
    [string]$Script,

    [switch]$Broadcast
)

$ErrorActionPreference = "Stop"
$env:PATH = "$env:USERPROFILE\.foundry\bin;" + $env:PATH
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

if (-not (Get-Command forge -ErrorAction SilentlyContinue)) { Write-Error "forge was not found" }

$signers = @("VAULT_ADMIN")
$action = $Script.ToLowerInvariant()
if ($Script -eq "Seed") {
    $signers = @("VAULT_ADMIN", "USER")
} elseif ($Script -eq "SetForwarder") {
    $signers = @("DEPLOYER")
    $action = "set-forwarder"
} elseif ($Script -eq "LockWorkflow") {
    $signers = @("DEPLOYER")
    $action = "lock-workflow"
} elseif ($Script -eq "Deploy") {
    $signers = @("DEPLOYER")
}

$mode = if ($Broadcast) { "BROADCAST" } else { "DRY RUN" }
Write-Output "$mode $Chain $Script"
& (Join-Path $PSScriptRoot "balances.ps1")

$log = Join-Path $PSScriptRoot "log-spend.ps1"
if ($Broadcast) {
    foreach ($signer in $signers) {
        & $log -Chain $Chain -Wallet $signer -Action $action -Phase before
    }
}

$forgeArgs = @("script", "script/${Script}.s.sol:${Script}", "--rpc-url", $Chain, "-vv")
if ($Broadcast) { $forgeArgs += @("--broadcast", "--verify") }

$prev = $ErrorActionPreference
$ErrorActionPreference = "Continue"
$raw = & forge @forgeArgs 2>&1 | Out-String
$code = $LASTEXITCODE
$ErrorActionPreference = $prev

$clean = $raw -replace 'https?://\S+', '[rpc]'
$clean = $clean -replace '(?i)(private[_ ]?key\s*[:=]\s*)\S+', '$1[redacted]'
Write-Output $clean

if ($Broadcast) {
    foreach ($signer in $signers) {
        & $log -Chain $Chain -Wallet $signer -Action $action -Phase after
    }
}

$gas = $null
$native = $null
$gwei = $null
foreach ($line in ($clean -split "`r?`n")) {
    if ($line -match 'Estimated total gas used for script:\s*([0-9,]+)') {
        $gas = ($Matches[1] -replace ',', '')
    }
    if ($line -match 'Estimated amount required:\s*([0-9.]+)') {
        $native = [decimal]$Matches[1]
    }
    if ($line -match 'Estimated gas price:\s*([0-9.]+)\s*gwei') {
        $gwei = [decimal]$Matches[1]
    }
}

$unit = if ($Chain -eq "base") { "ETH" } else { "BNB" }
$usdPrice = if ($Chain -eq "base") { [decimal]"2661.44" } else { [decimal]"757.59" }
Write-Output "----"
if ($gas) { Write-Output "ESTIMATED GAS $gas" }
if ($gwei) { Write-Output "GAS PRICE $gwei gwei" }
if ($null -ne $native) {
    $usd = $native * $usdPrice
    Write-Output ("ESTIMATED COST {0} {1} ({2} USD at {3})" -f $native.ToString("0.000000000000"), $unit, $usd.ToString("0.0000"), $usdPrice.ToString("0.00"))
} else {
    Write-Output "ESTIMATED COST not found in forge output"
}
if (-not $Broadcast) { Write-Output "NOT BROADCAST" }
if ($code -ne 0) { exit $code }
