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

$cfg = @{
    bsc  = @{ RpcKey = "BSC_RPC"; ChainId = 56; Unit = "BNB"; RecoveryKey = "RECOVERY_ADDRESS_BSC" }
    base = @{ RpcKey = "BASE_RPC"; ChainId = 8453; Unit = "ETH"; RecoveryKey = "RECOVERY_ADDRESS_BASE" }
}[$Chain]

$rpc = $vars[$cfg.RpcKey]
if ([string]::IsNullOrWhiteSpace($rpc)) { Write-Error "$($cfg.RpcKey) is empty" }

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

$recovery = $vars[$cfg.RecoveryKey]
$recoverySource = $cfg.RecoveryKey
if ($recovery -notmatch '^0x[a-fA-F0-9]{40}$') {
    $recovery = $vars["RECOVERY_ADDRESS"]
    $recoverySource = "RECOVERY_ADDRESS"
}
$recoveryOk = $recovery -match '^0x[a-fA-F0-9]{40}$'

$gasCall = Invoke-Cast @("gas-price", "--rpc-url", $rpc)
if ($gasCall.Code -ne 0 -or $gasCall.Text -notmatch '^\d+$') { Write-Error "Could not read gas price" }
$gasPrice = [System.Numerics.BigInteger]::Parse($gasCall.Text)
$transferCost = $gasPrice * [System.Numerics.BigInteger]21000 * [System.Numerics.BigInteger]2

$mode = if ($Execute) { "EXECUTE" } else { "DRY RUN" }
Write-Output "$mode $Chain chainId=$($cfg.ChainId)"
if ($recoveryOk) {
    Write-Output ("RECOVERY {0} from {1}" -f $recovery, $recoverySource)
} else {
    Write-Output "RECOVERY not set. Set RECOVERY_ADDRESS_BSC / RECOVERY_ADDRESS_BASE, or RECOVERY_ADDRESS."
}

$deployFile = Join-Path $root ("deployments\{0}.json" -f $cfg.ChainId)
$vault = $null
if (Test-Path $deployFile) {
    $deployed = Get-Content $deployFile -Raw | ConvertFrom-Json
    if ($deployed.vault -match '^0x[a-fA-F0-9]{40}$') { $vault = $deployed.vault }
}
$admin = $vars["VAULT_ADMIN_ADDRESS"]
if ($vault) {
    $vaultBal = Invoke-Cast @("balance", $vault, "--ether", "--rpc-url", $rpc)
    $shown = if ($vaultBal.Code -eq 0) { $vaultBal.Text } else { "unknown" }
    Write-Output ("RESCUE vault {0} -> VAULT_ADMIN {1}  balance {2} {3}" -f $vault, $admin, $shown, $cfg.Unit)
} else {
    Write-Output "RESCUE skipped. No vault in deployments/$($cfg.ChainId).json."
}

$wallets = @(
    @{ Role = "DEPLOYER"; AddressKey = "DEPLOYER_ADDRESS"; KeyKey = "DEPLOYER_PRIVATE_KEY" },
    @{ Role = "VAULT_ADMIN"; AddressKey = "VAULT_ADMIN_ADDRESS"; KeyKey = "VAULT_ADMIN_PRIVATE_KEY" },
    @{ Role = "USER"; AddressKey = "USER_ADDRESS"; KeyKey = "USER_PRIVATE_KEY" },
    @{ Role = "ATTACKER_FUNDER"; AddressKey = "ATTACKER_FUNDER_ADDRESS"; KeyKey = "ATTACKER_FUNDER_PRIVATE_KEY" }
)

$plan = @()
foreach ($wallet in $wallets) {
    $address = $vars[$wallet.AddressKey]
    $secret = $vars[$wallet.KeyKey]
    if ($address -notmatch '^0x[a-fA-F0-9]{40}$') {
        Write-Output ("SKIP {0}: address missing" -f $wallet.Role)
        continue
    }
    if ($secret -notmatch '^0x[a-fA-F0-9]{64}$') {
        Write-Output ("SKIP {0}: private key missing" -f $wallet.Role)
        continue
    }
    $weiCall = Invoke-Cast @("balance", $address, "--rpc-url", $rpc)
    if ($weiCall.Code -ne 0 -or $weiCall.Text -notmatch '^\d+$') {
        Write-Output ("SKIP {0}: balance lookup failed" -f $wallet.Role)
        continue
    }
    $wei = [System.Numerics.BigInteger]::Parse($weiCall.Text)
    if ($wei -le $transferCost) {
        Write-Output ("SKIP {0} {1}: balance does not cover gas" -f $wallet.Role, $address)
        continue
    }
    $sendWei = $wei - $transferCost
    $ether = [decimal]$sendWei / 1000000000000000000
    Write-Output ("SWEEP {0} {1} -> {2}  {3} {4}" -f $wallet.Role, $address, $(if ($recoveryOk) { $recovery } else { "(recovery not set)" }), $ether.ToString("0.000000"), $cfg.Unit)
    $plan += [pscustomobject]@{ Role = $wallet.Role; Address = $address; Key = $secret; Wei = $sendWei.ToString() }
}

$cre = $vars["CRE_BROADCAST_ADDRESS"]
if ($cre -match '^0x[a-fA-F0-9]{40}$') {
    Write-Output ("REMINDER CRE_BROADCAST {0} is not swept here. Its key is in the CRE repo. Send that balance to the recovery address from that repo." -f $cre)
} else {
    Write-Output "REMINDER CRE_BROADCAST_ADDRESS is empty. Its key is in the CRE repo, not this one."
}

if (-not $Execute) {
    Write-Output "Nothing sent. Re-run with -Execute after you approve this list."
    return
}

if (-not $recoveryOk) {
    Write-Error "Refusing to send. Recovery address is not set."
}

$log = Join-Path $PSScriptRoot "log-spend.ps1"
if ($vault) {
    $adminKey = $vars["VAULT_ADMIN_PRIVATE_KEY"]
    if ($adminKey -notmatch '^0x[a-fA-F0-9]{64}$') { Write-Error "VAULT_ADMIN_PRIVATE_KEY is missing" }
    & $log -Chain $Chain -Wallet VAULT_ADMIN -Action "rescue" -Phase before
    $rescued = Invoke-Cast @("send", $vault, "rescue(address)", $admin, "--private-key", $adminKey, "--rpc-url", $rpc)
    if ($rescued.Code -ne 0) {
        & $log -Chain $Chain -Wallet VAULT_ADMIN -Action "rescue" -Phase after
        Write-Error "rescue failed. No wallet sweeps were sent."
    }
    & $log -Chain $Chain -Wallet VAULT_ADMIN -Action "rescue" -Phase after
    $rescueHash = $rescued.Text
    if ($rescueHash -match '0x[a-fA-F0-9]{64}') { $rescueHash = $Matches[0] }
    Write-Output ("SENT rescue {0}" -f $rescueHash)
}

foreach ($row in $plan) {
    $weiNow = Invoke-Cast @("balance", $row.Address, "--rpc-url", $rpc)
    if ($weiNow.Code -ne 0 -or $weiNow.Text -notmatch '^\d+$') {
        Write-Error "Balance lookup failed for $($row.Role) after rescue. Later sweeps were not sent."
    }
    $current = [System.Numerics.BigInteger]::Parse($weiNow.Text)
    if ($current -le $transferCost) {
        Write-Output ("SKIP {0}: balance does not cover gas" -f $row.Role)
        continue
    }
    $sendWei = ($current - $transferCost).ToString()
    & $log -Chain $Chain -Wallet $row.Role -Action "sweep" -Phase before
    $sent = Invoke-Cast @("send", $recovery, "--value", "${sendWei}wei", "--private-key", $row.Key, "--rpc-url", $rpc)
    if ($sent.Code -ne 0) {
        & $log -Chain $Chain -Wallet $row.Role -Action "sweep" -Phase after
        Write-Error "Sweep from $($row.Role) failed. Later sweeps were not sent."
    }
    & $log -Chain $Chain -Wallet $row.Role -Action "sweep" -Phase after
    $hash = $sent.Text
    if ($hash -match '0x[a-fA-F0-9]{64}') { $hash = $Matches[0] }
    Write-Output ("SENT sweep {0} {1}" -f $row.Role, $hash)
}

Write-Output "Logged each transfer to spend-log.csv"
