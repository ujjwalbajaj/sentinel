param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("bsc", "base")]
    [string]$Chain,

    [switch]$Execute
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $root ".env"

if (-not (Test-Path $envPath)) {
    Write-Error ".env not found"
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

# Fixed payouts match docs/WALLETS.md. CRE_BROADCAST receives the remainder after the
# deployer keep, those three payouts, and a gas buffer for the four transfers.
$plan = @{
    bsc = @{
        RpcKey = "BSC_RPC"
        ChainId = 56
        Unit = "BNB"
        Keep = [decimal]"0.013200"
        BufferFloor = [decimal]"0.000100"
        Recipients = @(
            @{ Role = "VAULT_ADMIN"; Amount = [decimal]"0.019800" },
            @{ Role = "USER"; Amount = [decimal]"0.003960" },
            @{ Role = "ATTACKER_FUNDER"; Amount = [decimal]"0.006600" }
        )
    }
    base = @{
        RpcKey = "BASE_RPC"
        ChainId = 8453
        Unit = "ETH"
        Keep = [decimal]"0.003757"
        BufferFloor = [decimal]"0.000050"
        Recipients = @(
            @{ Role = "VAULT_ADMIN"; Amount = [decimal]"0.005636" },
            @{ Role = "USER"; Amount = [decimal]"0.001127" },
            @{ Role = "ATTACKER_FUNDER"; Amount = [decimal]"0.001879" }
        )
    }
}

$cfg = $plan[$Chain]
$rpc = $vars[$cfg.RpcKey]
$deployer = $vars["DEPLOYER_ADDRESS"]
$key = $vars["DEPLOYER_PRIVATE_KEY"]

if ([string]::IsNullOrWhiteSpace($rpc)) { Write-Error "$($cfg.RpcKey) is empty" }
if ($deployer -notmatch '^0x[a-fA-F0-9]{40}$') { Write-Error "DEPLOYER_ADDRESS is missing" }
if ($key -notmatch '^0x[a-fA-F0-9]{64}$') { Write-Error "DEPLOYER_PRIVATE_KEY is missing" }

function Invoke-Cast {
    param([string[]]$Arguments)
    $prev = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    $output = & $cast @Arguments 2>$null
    $code = $LASTEXITCODE
    $ErrorActionPreference = $prev
    return @{ Code = $code; Text = ($output | Out-String).Trim() }
}

$chainId = Invoke-Cast @("chain-id", "--rpc-url", $rpc)
if ($chainId.Code -ne 0 -or $chainId.Text -notmatch '^\d+$') { Write-Error "Could not read chain id for $Chain" }
if ([int]$chainId.Text -ne $cfg.ChainId) { Write-Error "RPC for $Chain returned chain id $($chainId.Text), expected $($cfg.ChainId)" }

$balanceCall = Invoke-Cast @("balance", $deployer, "--ether", "--rpc-url", $rpc)
if ($balanceCall.Code -ne 0 -or $balanceCall.Text -notmatch '^[0-9.]+$') { Write-Error "Could not read deployer balance" }
$balance = [decimal]$balanceCall.Text

$gasCall = Invoke-Cast @("gas-price", "--rpc-url", $rpc)
$liveBuffer = [decimal]0
if ($gasCall.Code -eq 0 -and $gasCall.Text -match '^\d+$') {
    # 21,000 gas per transfer, four transfers, twice the current price.
    $liveWei = [decimal]$gasCall.Text * 21000 * 4 * 2
    $liveBuffer = $liveWei / 1000000000000000000
}
$buffer = [decimal][Math]::Max($liveBuffer, $cfg.BufferFloor)

$fixed = [decimal]0
foreach ($recipient in $cfg.Recipients) { $fixed += $recipient.Amount }
$creRaw = $balance - $cfg.Keep - $fixed - $buffer
$creAmount = [decimal]::Floor($creRaw * 1000000) / 1000000
if ($creAmount -lt 0) { $creAmount = [decimal]0 }

$cfg.Recipients += @{ Role = "CRE_BROADCAST"; Amount = $creAmount }

$outgoing = [decimal]0
$rows = @()
$blocked = @()
foreach ($recipient in $cfg.Recipients) {
    $addressKey = if ($recipient.Role -eq "CRE_BROADCAST") { "CRE_BROADCAST_ADDRESS" } else { "$($recipient.Role)_ADDRESS" }
    $address = $vars[$addressKey]
    $outgoing += $recipient.Amount
    if ($address -notmatch '^0x[a-fA-F0-9]{40}$') {
        $blocked += "$($recipient.Role) ($addressKey is empty)"
        $rows += [pscustomobject]@{ Role = $recipient.Role; Address = "(not set)"; Amount = $recipient.Amount }
    } else {
        $rows += [pscustomobject]@{ Role = $recipient.Role; Address = $address; Amount = $recipient.Amount }
    }
}

$mode = if ($Execute) { "EXECUTE" } else { "DRY RUN" }
Write-Output "$mode $Chain chainId=$($cfg.ChainId)"
Write-Output ("FROM DEPLOYER {0}" -f $deployer)
Write-Output ("BALANCE {0} {1}" -f $balance.ToString("0.000000"), $cfg.Unit)
Write-Output ("KEEP ON DEPLOYER {0} {1}" -f $cfg.Keep.ToString("0.000000"), $cfg.Unit)
Write-Output ("GAS BUFFER {0} {1}" -f $buffer.ToString("0.000000"), $cfg.Unit)
Write-Output ("SEND TOTAL {0} {1}" -f $outgoing.ToString("0.000000"), $cfg.Unit)
foreach ($row in $rows) {
    Write-Output ("  {0} {1}  {2} {3}" -f $row.Role, $row.Address, $row.Amount.ToString("0.000000"), $cfg.Unit)
}
$after = $balance - $outgoing
Write-Output ("DEPLOYER AFTER SEND {0} {1}" -f $after.ToString("0.000000"), $cfg.Unit)
if ($after -lt $cfg.Keep) {
    Write-Output ("WARNING deployer would fall below its keep amount by {0} {1}" -f ($cfg.Keep - $after).ToString("0.000000"), $cfg.Unit)
}
if ($balance -lt $outgoing) {
    Write-Output ("SHORT by {0} {1}. Nothing sent." -f ($outgoing - $balance).ToString("0.000000"), $cfg.Unit)
}

if (-not $Execute) {
    Write-Output "Nothing sent. Re-run with -Execute after you approve this list."
    return
}

if ($blocked.Count -gt 0) {
    Write-Error ("Refusing to send. Fix: " + ($blocked -join "; "))
}
if ($balance -lt $outgoing) {
    Write-Error "Refusing to send. Deployer balance is below the transfer total."
}
if ($creAmount -le 0) {
    Write-Error "Refusing to send. Nothing left for CRE_BROADCAST after the keep, the three payouts, and gas."
}

$log = Join-Path $PSScriptRoot "log-spend.ps1"
foreach ($row in $rows) {
    if ($row.Amount -le 0) { continue }
    & $log -Chain $Chain -Wallet DEPLOYER -Action ("distribute " + $row.Role) -Phase before
    $valueArg = "{0}ether" -f $row.Amount.ToString("0.000000")
    $sent = Invoke-Cast @("send", $row.Address, "--value", $valueArg, "--private-key", $key, "--rpc-url", $rpc)
    if ($sent.Code -ne 0) {
        & $log -Chain $Chain -Wallet DEPLOYER -Action ("distribute " + $row.Role) -Phase after
        Write-Error "Transfer to $($row.Role) failed. Earlier transfers in this run may already be mined."
    }
    $hash = $sent.Text
    if ($hash -match '0x[a-fA-F0-9]{64}') { $hash = $Matches[0] }
    & $log -Chain $Chain -Wallet DEPLOYER -Action ("distribute " + $row.Role) -Phase after
    Write-Output ("SENT {0} {1}" -f $row.Role, $hash)
}

Write-Output "Logged each transfer to spend-log.csv"
