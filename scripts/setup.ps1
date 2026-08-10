# Downloads a pinned, project-local Node.js runtime (official nodejs.org zip distribution,
# no installer, no admin rights required) into .tools/node/, enables corepack from within
# that runtime, and installs workspace dependencies via pnpm.
#
# Never installs anything globally. Never touches the machine's existing global Node 16
# install. See docs/DEVELOPMENT-SETUP.md.

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$NodeDir = Join-Path $RepoRoot ".tools\node"
$NodeMajor = 24

if (Test-Path (Join-Path $NodeDir "node.exe")) {
    Write-Host "Project-local Node already present at $NodeDir"
}
else {
    Write-Host "Resolving latest Node $NodeMajor.x LTS release..."
    $index = Invoke-RestMethod -Uri "https://nodejs.org/dist/index.json"
    $release = $index | Where-Object { $_.version -like "v$NodeMajor.*" -and $_.lts } | Select-Object -First 1
    if (-not $release) {
        throw "Could not resolve a Node $NodeMajor.x LTS release from nodejs.org/dist/index.json. Check connectivity or pin a version manually."
    }
    $version = $release.version
    $zipName = "node-$version-win-x64.zip"
    $url = "https://nodejs.org/dist/$version/$zipName"
    $tmpZip = Join-Path $env:TEMP $zipName

    Write-Host "Downloading $url"
    Invoke-WebRequest -Uri $url -OutFile $tmpZip

    $extractDir = Join-Path $env:TEMP "node-extract-$version"
    if (Test-Path $extractDir) { Remove-Item -Recurse -Force $extractDir }
    Expand-Archive -Path $tmpZip -DestinationPath $extractDir

    New-Item -ItemType Directory -Force -Path (Split-Path $NodeDir) | Out-Null
    $extractedNodeFolder = Join-Path $extractDir "node-$version-win-x64"
    Move-Item -Path $extractedNodeFolder -Destination $NodeDir

    Remove-Item $tmpZip -Force
    Remove-Item -Recurse -Force $extractDir
    Write-Host "Installed Node $version to $NodeDir"
}

$env:PATH = "$NodeDir;$env:PATH"

Write-Host "Enabling corepack (project-local only)..."
& "$NodeDir\corepack.cmd" enable

Push-Location $RepoRoot
try {
    Write-Host "Installing workspace dependencies via pnpm..."
    & "$NodeDir\corepack.cmd" pnpm install
}
finally {
    Pop-Location
}

Write-Host ""
Write-Host "Setup complete. Node/npm/pnpm are project-local under .tools/node/ and untouched globally."
Write-Host "Next: .\scripts\dev.ps1"
