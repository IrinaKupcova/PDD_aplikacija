# Pakalpojumu vadība — izveido Supabase tabulas (kopīga sinhronizācija + vēsture).
#
#   $env:SUPABASE_DB_PASSWORD = 'postgres-parole'
#   .\scripts\apply-pakalpojumu-vadiba-migration.ps1
#
# Vai Supabase → SQL Editor → ielīmē:
#   supabase/PIEMEROT_PAKALPOJUMU_VADIBAS_MODULIS.sql

$ErrorActionPreference = 'Stop'
$Root = Split-Path $PSScriptRoot -Parent
$Migration = Join-Path $Root 'supabase\PIEMEROT_PAKALPOJUMU_VADIBAS_MODULIS.sql'
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
Supabase → Project Settings → Database → Database password.

  `$env:SUPABASE_DB_PASSWORD = 'tava-parole'
  .\scripts\apply-pakalpojumu-vadiba-migration.ps1

Vai ātrāk: SQL Editor → ielīmē supabase/PIEMEROT_PAKALPOJUMU_VADIBAS_MODULIS.sql → Run
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
  Write-Error 'Nav psql. Alternatīva: Supabase SQL Editor ar PIEMEROT_PAKALPOJUMU_VADIBAS_MODULIS.sql'
}

$hostName = "db.$ref.supabase.co"
Write-Host "Pakalpojumu vadība migrācija → $hostName" -ForegroundColor Cyan
$env:PGPASSWORD = $dbPass
$env:PGSSLMODE = 'require'
& $psql -h $hostName -p 5432 -U postgres -d postgres -v ON_ERROR_STOP=1 -f $Migration
$exit = $LASTEXITCODE
Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
Remove-Item Env:\PGSSLMODE -ErrorAction SilentlyContinue
if ($exit -ne 0) { Write-Error "psql beidzās ar kodu $exit" }
Write-Host 'Gatavs. Atver Pakalpojumu vadību un Ctrl+F5 — jābūt «Sinhronizēts ar Supabase».' -ForegroundColor Green
