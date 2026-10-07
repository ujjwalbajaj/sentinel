$ErrorActionPreference = "Stop"
$env:PATH = "$env:USERPROFILE\.foundry\bin;" + $env:PATH
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
if (-not (Get-Command forge -ErrorAction SilentlyContinue)) { Write-Error "forge was not found" }

$contracts = @(
    @{ Name = "VulnerableVault"; Source = "src/VulnerableVault.sol:VulnerableVault" },
    @{ Name = "Guardian"; Source = "src/Guardian.sol:Guardian" },
    @{ Name = "MockMixer"; Source = "src/MockMixer.sol:MockMixer" },
    @{ Name = "Attacker"; Source = "src/Attacker.sol:Attacker" }
)

$abiDir = Join-Path $root "abi"
New-Item -ItemType Directory -Force -Path $abiDir | Out-Null
$utf8 = New-Object System.Text.UTF8Encoding $false

foreach ($contract in $contracts) {
    $prev = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    $raw = & forge inspect $contract.Source abi --json 2>$null
    $code = $LASTEXITCODE
    $ErrorActionPreference = $prev
    if ($code -ne 0) { Write-Error "ABI export failed for $($contract.Name)" }
    $json = ($raw | Out-String).Trim()
    $dest = Join-Path $abiDir ($contract.Name + ".json")
    [System.IO.File]::WriteAllText($dest, $json + "`n", $utf8)
    Write-Output ("exported {0}" -f $dest)
}

$source = @"
{
  "contractsRepo": "sentinel-contracts",
  "timestamp": "$([DateTime]::UtcNow.ToString('o'))",
  "chainIds": [8453, 56]
}
"@
[System.IO.File]::WriteAllText((Join-Path $abiDir ".source.json"), $source.Trim() + "`n", $utf8)
Write-Output "wrote abi/.source.json"
