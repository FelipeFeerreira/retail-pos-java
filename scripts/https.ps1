$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$certDirectory = Join-Path $root 'certs'
New-Item -ItemType Directory -Force -Path $certDirectory | Out-Null
if ((Test-Path -LiteralPath (Join-Path $certDirectory 'localhost.key')) -or (Test-Path -LiteralPath (Join-Path $certDirectory 'localhost.crt'))) {
  Write-Host 'Existing certificates preserved.'
} else {
  docker run --rm -v "${certDirectory}:/certs" alpine/openssl req -x509 -nodes -days 365 -newkey rsa:3072 -keyout /certs/localhost.key -out /certs/localhost.crt -subj /CN=localhost -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"
  if ($LASTEXITCODE -ne 0) { throw 'Certificate generation failed' }
}
Write-Host 'Start: docker compose -f docker-compose.yml -f docker-compose.https.yml up -d'
Write-Host 'Open https://localhost:3443 and trust the local certificate only on your development computer.'
