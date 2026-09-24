$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $root
$configuration = @{}
Get-Content -LiteralPath '.env' | ForEach-Object { if ($_ -match '^([^#=]+)=(.*)$') { $configuration[$matches[1]]=$matches[2] } }
$suffix = [Guid]::NewGuid().ToString('N').Substring(0,12)
$dbName = "restore_test_$suffix"
$containerName = "sistemajava-restore-test-$suffix"
$envPath = Join-Path $root ".tools/restore-$suffix.env"
$lines = @("SPRING_DATASOURCE_URL=jdbc:postgresql://db:5432/$dbName","SPRING_DATASOURCE_USERNAME=mercadinho",("SPRING_DATASOURCE_PASSWORD="+$configuration['DB_PASSWORD']),("JWT_SECRET="+$configuration['JWT_SECRET']),("ADMIN_PASSWORD="+$configuration['ADMIN_PASSWORD']),"BACKUP_DIRECTORY=/app/backups","BACKUP_CRON=-")
[IO.File]::WriteAllLines($envPath,$lines,(New-Object Text.UTF8Encoding $false))
docker compose exec -T db createdb -U mercadinho $dbName
if ($LASTEXITCODE -ne 0) { throw 'Could not create isolated test database' }
try {
  docker run -d --rm --name $containerName --network sistemajava_default -p '127.0.0.1:8081:8080' --env-file $envPath sistemajava-backend
  if ($LASTEXITCODE -ne 0) { throw 'Could not start isolated backend' }
  node scripts/restore-smoke.mjs
  if ($LASTEXITCODE -ne 0) { docker logs --tail 30 $containerName; throw 'Restore test failed' }
} finally {
  docker stop $containerName
  docker compose exec -T db dropdb -U mercadinho --if-exists $dbName
  Remove-Item -LiteralPath $envPath -Force
}
