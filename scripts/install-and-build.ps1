$ErrorActionPreference = "Stop"
Set-Location (Split-Path -Parent $PSScriptRoot)

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host "Nav atrasts 'node'. Instalē Node.js LTS: https://nodejs.org — pēc tam palaid šo skriptu vēlreiz."
  exit 1
}

npm install
npm run build
Write-Host ""
Write-Host "Gatavs: dist/ — šo mapi augšupielādē hostingā vai izmanto GitHub Actions."
