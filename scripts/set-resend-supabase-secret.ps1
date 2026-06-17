# Vienreizēja Resend atslēgas ielikšana Supabase Edge Functions.
# Nepieciešams: Supabase Access Token (https://supabase.com/dashboard/account/tokens)
#
# Lietošana:
#   .\scripts\set-resend-supabase-secret.ps1
# vai ar parametriem:
#   .\scripts\set-resend-supabase-secret.ps1 -ResendKey "re_..." -From "PDD <onboarding@resend.dev>"

param(
  [string]$ProjectRef = "fdnkvecgqetmwilwolgt",
  [string]$AccessToken = $env:SUPABASE_ACCESS_TOKEN,
  [string]$ResendKey = $env:RESEND_API_KEY,
  [string]$From = $env:RESEND_FROM
)

$ErrorActionPreference = "Stop"

if (-not $AccessToken) {
  $AccessToken = Read-Host "Supabase Access Token (dashboard → Account → Access Tokens)"
}
if (-not $ResendKey) {
  $ResendKey = Read-Host "Resend API Key (resend.com → API Keys, sākas ar re_)"
}
if (-not $From) {
  $From = Read-Host "RESEND_FROM (piem. PDD <onboarding@resend.dev>)"
}

$ResendKey = ($ResendKey -replace '[\r\n\uFEFF]', '').Trim().Trim('"').Trim("'")
$From = ($From -replace '[\r\n\uFEFF]', '').Trim().Trim('"').Trim("'")

if (-not $ResendKey.StartsWith("re_")) {
  Write-Warning "Atslēga parasti sākas ar re_ — pārbaudi, vai nokopēji pareizi."
}

$supabase = Get-Command supabase -ErrorAction SilentlyContinue
if (-not $supabase) {
  Write-Host "Instalē Supabase CLI..."
  npm install -g supabase@2.20.12
}

$env:SUPABASE_ACCESS_TOKEN = $AccessToken
supabase secrets set --project-ref $ProjectRef RESEND_API_KEY="$ResendKey" RESEND_FROM="$From"

Write-Host ""
Write-Host "Gatavs. Pārlūkā (F12): await PDD_DIAGNOSE_EMAIL()" -ForegroundColor Green
