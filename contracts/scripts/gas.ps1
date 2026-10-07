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

$chains = @(
    @{ Name = "BNB Chain"; RpcKey = "BSC_RPC" },
    @{ Name = "Base"; RpcKey = "BASE_RPC" }
)

foreach ($chain in $chains) {
    $rpc = $vars[$chain.RpcKey]
    if ([string]::IsNullOrWhiteSpace($rpc)) {
        Write-Output ("{0}: RPC not set ({1})" -f $chain.Name, $chain.RpcKey)
        continue
    }
    $prev = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    $output = & $cast gas-price --rpc-url $rpc 2>$null
    $code = $LASTEXITCODE
    $ErrorActionPreference = $prev
    $text = ($output | Out-String).Trim()
    if ($code -ne 0 -or $text -notmatch '^\d+$') {
        Write-Output ("{0}: gas price lookup failed" -f $chain.Name)
        continue
    }
    $gwei = [decimal]$text / 1000000000
    Write-Output ("{0}: {1} gwei" -f $chain.Name, $gwei.ToString("0.####"))
}
