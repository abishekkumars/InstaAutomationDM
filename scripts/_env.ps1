# Shared helper, dot-sourced by the other scripts in this folder.
# Resolves the project-local Node/npm/pnpm and prepends them to PATH for the
# current process only. Never touches the global Node install or system PATH.
# See docs/DEVELOPMENT-SETUP.md for the full rationale.

$script:RepoRoot = Split-Path -Parent $PSScriptRoot
$script:NodeDir = Join-Path $RepoRoot ".tools\node"

function Assert-ProjectLocalNode {
    if (-not (Test-Path (Join-Path $NodeDir "node.exe"))) {
        Write-Error "Project-local Node runtime not found at $NodeDir. Run .\scripts\setup.ps1 first."
        exit 1
    }
    $env:PATH = "$NodeDir;$env:PATH"
}
