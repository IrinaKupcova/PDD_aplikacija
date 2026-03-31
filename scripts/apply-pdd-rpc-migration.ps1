# Palaist PDD RPC atgūšanas migrāciju pret Supabase Postgres (bez Node.js).
#
# Iestatīt paroli (Database settings → postgres user) un palaist:
#   $env:SUPABASE_DB_PASSWORD = 'jusu-parole'
#   .\scripts\apply-pdd-rpc-migration.ps1
#
# Vai vienu rindu:
#   $env:SUPABASE_DB_PASSWORD='…'; .\scripts\apply-pdd-rpc-migration.ps1

$ErrorActionPreference = 'Stop'
$Root = Split-Path $PSScriptRoot -Parent
if (-not (Test-Path (Join-Path $Root 'supabase\migrations'))) {
  $walk = $PSScriptRoot
  while ($walk -and -not (Test-Path (Join-Path $walk 'supabase\migrations'))) {
    $walk = Split-Path $walk -Parent
  }
  $Root = $walk
}
if (-not $Root -or -not (Test-Path (Join-Path $Root 'supabase\migrations'))) {
  Write-Error 'Neatrada projekta sakni ar supabase/migrations.'
}

$Migration = Join-Path $Root 'supabase\migrations\20260330260000_pdd_ensure_session_rpcs.sql'
if (-not (Test-Path $Migration)) {
  Write-Error "Nav faila: $Migration"
}

$ref = 'fdnkvecgqetmwilwolgt'
$config = Join-Path $Root 'supabase\config.toml'
if (Test-Path $config) {
  $line = Get-Content $config | Where-Object { $_ -match '^\s*project_id\s*=' } | Select-Object -First 1
  if ($line -match 'project_id\s*=\s*"([^"]+)"') { $ref = $Matches[1].Trim() }
  elseif ($line -match "project_id\s*=\s*'([^']+)'") { $ref = $Matches[1].Trim() }
}

$dbPass = $env:SUPABASE_DB_PASSWORD
if ([string]::IsNullOrWhiteSpace($dbPass) -and (Test-Path (Join-Path $Root 'supabase-db-password.local.txt'))) {
  $dbPass = (Get-Content (Join-Path $Root 'supabase-db-password.local.txt') -Raw).Trim()
}
if ([string]::IsNullOrWhiteSpace($dbPass)) {
  Write-Error @"
Nav datubāzes paroles.
Supabase → Project Settings → Database → iekopē "postgres" lietotāja paroli (vai Reset password).

PowerShell:
  `$env:SUPABASE_DB_PASSWORD = 'tava-parole'
  .\scripts\apply-pdd-rpc-migration.ps1

Vai izveido repozitorija saknē failu supabase-db-password.local.txt (viena rinda, parole) — fails ir .gitignore.
"@
}

$psql = $null
foreach ($cand in @(
    'C:\Program Files\PostgreSQL\17\bin\psql.exe',
    'C:\Program Files\PostgreSQL\16\bin\psql.exe',
    'C:\Program Files\PostgreSQL\15\bin\psql.exe'
  )) {
  if (Test-Path $cand) { $psql = $cand; break }
}
if (-not $psql) {
  $wp = (Get-Command psql.exe -ErrorAction SilentlyContinue).Source
  if ($wp) { $psql = $wp }
}
if (-not $psql) {
  Write-Error 'Nav psql. Instalē: winget install PostgreSQL.PostgreSQL.17'
}

$hostName = "db.$ref.supabase.co"

Write-Host "Migrācija → $hostName (projekts $ref)" -ForegroundColor Cyan
Write-Host "Fails: $Migration" -ForegroundColor Gray

$env:PGPASSWORD = $dbPass
$env:PGSSLMODE = 'require'

& $psql -h $hostName -p 5432 -U postgres -d postgres -v ON_ERROR_STOP=1 -f $Migration
$exit = $LASTEXITCODE
Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
Remove-Item Env:\PGSSLMODE -ErrorAction SilentlyContinue

if ($exit -ne 0) {
  Write-Error "psql beidzās ar kodu $exit"
}

Write-Host 'Gatavs. Pārbaudi: select proname, pg_get_function_identity_arguments(oid) from pg_proc where proname = ''pdd_submit_absence_session'';' -ForegroundColor Green
