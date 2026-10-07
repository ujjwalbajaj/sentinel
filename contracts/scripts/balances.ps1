$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $root ".env"

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

$roles = @(
    @{ Role = "DEPLOYER"; Key = "DEPLOYER_ADDRESS" },
    @{ Role = "VAULT_ADMIN"; Key = "VAULT_ADMIN_ADDRESS" },
    @{ Role = "USER"; Key = "USER_ADDRESS" },
    @{ Role = "ATTACKER_FUNDER"; Key = "ATTACKER_FUNDER_ADDRESS" },
    @{ Role = "CRE_BROADCAST"; Key = "CRE_BROADCAST_ADDRESS" }
)

$chains = @(
    @{ Name = "BNB Chain"; RpcKey = "BSC_RPC"; Unit = "BNB" },
    @{ Name = "Base"; RpcKey = "BASE_RPC"; Unit = "ETH" }
)

foreach ($role in $roles) {
    $address = $vars[$role.Key]
    if ([string]::IsNullOrWhiteSpace($address)) {
        Write-Output ("{0}: {1} is empty" -f $role.Role, $role.Key)
        continue
    }
    Write-Output ("{0} {1}" -f $role.Role, $address)
    foreach ($chain in $chains) {
        $rpc = $vars[$chain.RpcKey]
        if ([string]::IsNullOrWhiteSpace($rpc)) {
            Write-Output ("  {0}: RPC not set ({1})" -f $chain.Name, $chain.RpcKey)
            continue
        }
        $prev = $ErrorActionPreference
        $ErrorActionPreference = "Continue"
        $output = & $cast balance $address --ether --rpc-url $rpc 2>$null
        $code = $LASTEXITCODE
        $ErrorActionPreference = $prev
        if ($code -ne 0 -or [string]::IsNullOrWhiteSpace(($output | Out-String))) {
            Write-Output ("  {0}: balance lookup failed" -f $chain.Name)
        } else {
            Write-Output ("  {0}: {1} {2}" -f $chain.Name, ($output | Out-String).Trim(), $chain.Unit)
        }
    }
}
