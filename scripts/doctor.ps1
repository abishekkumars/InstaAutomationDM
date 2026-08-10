# Environment diagnostics: reports exactly which Node/npm/pnpm this shell would use for
# project commands, and fails loudly (non-zero exit) if it's not the project-local runtime.
# Run this any time you're unsure whether a command "really" ran under the right Node -
# see docs/DEVELOPMENT-SETUP.md, "Enforcing the project-local Node runtime".
#
# Usage: .\scripts\doctor.ps1

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
$NodeDir = Join-Path $RepoRoot ".tools\node"
$ExpectedMajor = 24

Write-Host "=== AutomationDM environment diagnostics ==="
Write-Host "Project root:            $RepoRoot"
Write-Host "Expected Node runtime:   $NodeDir"
Write-Host ""

if (-not (Test-Path (Join-Path $NodeDir "node.exe"))) {
    Write-Host "Project-local Node:      NOT FOUND"
    Write-Host ""
    Write-Error "No project-local Node runtime at $NodeDir. Run .\scripts\setup.ps1 first."
    exit 1
}

# Deliberately do NOT dot-source _env.ps1 here - this script's whole point is to report
# what a bare shell resolves *before* any PATH fix-up, then what it resolves *after*, so
# the difference (and the risk) is visible rather than silently corrected away.

$beforeNode = Get-Command node -ErrorAction SilentlyContinue
if ($beforeNode) {
    $beforeVersion = (& $beforeNode.Source --version).Trim()
    Write-Host "Before PATH fix-up:"
    Write-Host "  node resolves to:     $($beforeNode.Source)"
    Write-Host "  node version:         $beforeVersion"
}
else {
    Write-Host "Before PATH fix-up:      node not found on PATH at all"
}
Write-Host ""

$env:PATH = "$NodeDir;$env:PATH"
$afterNode = Get-Command node -ErrorAction SilentlyContinue
$afterNodeVersion = (& $afterNode.Source --version).Trim()
$afterNpmVersion = (& "$NodeDir\npm.cmd" --version).Trim()
$afterPnpmVersion = (& "$NodeDir\corepack.cmd" pnpm --version).Trim()

$resolvedDir = (Split-Path $afterNode.Source -Parent).TrimEnd('\')
$usingProjectLocal = ($resolvedDir -eq $NodeDir.TrimEnd('\'))
$actualMajor = [int]($afterNodeVersion -replace '^v(\d+)\..*$', '$1')

Write-Host "After PATH fix-up (what scripts/*.ps1 and scripts/pnpm.ps1 actually use):"
Write-Host "  Node version:          $afterNodeVersion"
Write-Host "  Node executable:       $($afterNode.Source)"
Write-Host "  npm version:           $afterNpmVersion"
Write-Host "  pnpm version:          $afterPnpmVersion"
Write-Host "  Using project-local:   $usingProjectLocal"
Write-Host ""

if (-not $usingProjectLocal -or $actualMajor -lt 20) {
    Write-Error "WRONG NODE RUNTIME. Expected project-local Node $ExpectedMajor.x from $NodeDir, but resolved $afterNodeVersion at $($afterNode.Source). Do not trust any build/lint/test run in this shell."
    exit 1
}

Write-Host "OK: project-local Node $afterNodeVersion is correctly resolved and is what every scripts/*.ps1 and scripts/pnpm.ps1 invocation uses."
