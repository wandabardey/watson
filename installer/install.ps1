# Installe ou réinstalle Watson sur Windows, dans PowerShell :
#   irm https://raw.githubusercontent.com/wandabardey/watson/main/installer/install.ps1 | iex
# Télécharge la dernière version publiée, vérifie son empreinte SHA-256 et l'installe pour l'utilisateur courant.
# Ensuite, Watson se met à jour tout seul.
$ErrorActionPreference = 'Stop'
$depot = 'wandabardey/watson'
Write-Host 'Recherche de la dernière version de Watson…'
$version = Invoke-RestMethod "https://api.github.com/repos/$depot/releases/latest"
$installeur = $version.assets | Where-Object { $_.name -like '*x64-setup.exe' } | Select-Object -First 1
$empreintes = $version.assets | Where-Object { $_.name -eq 'SHA256SUMS' } | Select-Object -First 1
if (-not $installeur -or -not $empreintes) { throw "Version introuvable sur https://github.com/$depot/releases" }

$fichier = Join-Path $env:TEMP $installeur.name
Write-Host "Téléchargement de Watson $($version.tag_name) (environ 160 Mo)…"
Invoke-WebRequest $installeur.browser_download_url -OutFile $fichier -UseBasicParsing
$liste = (Invoke-WebRequest $empreintes.browser_download_url -UseBasicParsing).Content
if ($liste -is [byte[]]) { $liste = [Text.Encoding]::UTF8.GetString($liste) }
$ligne = ($liste -split "`n") | Where-Object { $_ -match [regex]::Escape($installeur.name) } | Select-Object -First 1
$attendu = ($ligne -split '\s+')[0].ToLower()
$obtenu = (Get-FileHash $fichier -Algorithm SHA256).Hash.ToLower()
if (-not $attendu -or $attendu -ne $obtenu) {
  Remove-Item $fichier -Force
  throw 'Empreinte incorrecte : le téléchargement a été altéré, installation annulée.'
}
Start-Process $fichier -ArgumentList '/S' -Wait
Remove-Item $fichier -Force
Write-Host 'Watson est installé : il est dans le menu Démarrer.'
