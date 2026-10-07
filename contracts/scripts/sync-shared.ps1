$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $root ".env"
if (-not (Test-Path $envPath)) { Write-Error ".env not found" }

function Read-EnvMap {
    param([string]$Path)
    $vars = @{}
    Get-Content $Path | ForEach-Object {
        $line = $_.Trim()
        if ($line -eq "" -or $line.StartsWith("#")) { return }
        $idx = $line.IndexOf("=")
        if ($idx -lt 1) { return }
        $name = $line.Substring(0, $idx).Trim()
        $value = $line.Substring($idx + 1).Trim()
        if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
            $value = $value.Substring(1, $value.Length - 2)
        }
        if ($value -match '^(.*?)\s+#') { $value = $Matches[1].Trim() }
        $vars[$name] = $value
    }
    return $vars
}

$vars = Read-EnvMap $envPath
$abiDir = Join-Path $root "abi"
$deployFiles = @("8453.json", "56.json")
if (-not (Test-Path $abiDir)) { Write-Error "abi/ is missing. Run npm run export-abi first." }
foreach ($name in $deployFiles) {
    if (-not (Test-Path (Join-Path $root "deployments\$name"))) { Write-Error "deployments/$name is missing." }
}

$abiNames = @("VulnerableVault.json", "Guardian.json", "MockMixer.json", "Attacker.json")
foreach ($name in $abiNames) {
    if (-not (Test-Path (Join-Path $abiDir $name))) { Write-Error "abi/$name is missing." }
}

$utf8 = New-Object System.Text.UTF8Encoding $false
$stamp = @"
{
  "contractsRepo": "sentinel-contracts",
  "timestamp": "$([DateTime]::UtcNow.ToString('o'))",
  "chainIds": [8453, 56]
}
"@
$sourceFile = Join-Path $abiDir ".source.json"
[System.IO.File]::WriteAllText($sourceFile, $stamp.Trim() + "`n", $utf8)

$keys = @("BACKEND_SHARED_PATH", "FRONTEND_SHARED_PATH", "CRE_SHARED_PATH")
foreach ($key in $keys) {
    $dest = $vars[$key]
    if ([string]::IsNullOrWhiteSpace($dest)) {
        Write-Error "$key is empty. Set it in .env before syncing."
    }
    if (-not (Test-Path -LiteralPath $dest -PathType Container)) {
        Write-Error "$key does not exist: $dest"
    }
    $abiDest = Join-Path $dest "abi"
    $depDest = Join-Path $dest "deployments"
    New-Item -ItemType Directory -Force -Path $abiDest, $depDest | Out-Null
    foreach ($name in $abiNames) {
        Copy-Item -LiteralPath (Join-Path $abiDir $name) -Destination (Join-Path $abiDest $name) -Force
    }
    Copy-Item -LiteralPath $sourceFile -Destination (Join-Path $abiDest ".source.json") -Force
    foreach ($name in $deployFiles) {
        Copy-Item -LiteralPath (Join-Path $root "deployments\$name") -Destination (Join-Path $depDest $name) -Force
    }
    Write-Output "synced $key"
}
