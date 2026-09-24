$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$target = Join-Path $projectRoot '.env'
if (Test-Path -LiteralPath $target) { Write-Host '.env already exists; credentials were preserved.'; exit 0 }
function New-Secret([int]$Length) {
  $buffer = New-Object byte[] $Length
  $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
  try { $rng.GetBytes($buffer) } finally { $rng.Dispose() }
  return [Convert]::ToBase64String($buffer)
}
$databaseSecret = New-Secret 32
$jwtSecret = New-Secret 48
$adminSecret = New-Secret 18
$text = "DB_PASSWORD=$databaseSecret`nJWT_SECRET=$jwtSecret`nADMIN_PASSWORD=$adminSecret`nAPP_ORIGIN=http://localhost:3000`nBACKUP_RETENTION_DAYS=14`n"
[IO.File]::WriteAllText($target, $text, (New-Object Text.UTF8Encoding $false))
Write-Host 'Created .env with unique credentials. User: admin. Read ADMIN_PASSWORD in .env locally.'
Write-Host 'Start: docker compose up --build -d'
Write-Host 'Open: http://localhost:3000'
