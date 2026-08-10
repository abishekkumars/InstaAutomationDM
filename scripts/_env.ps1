# Shared helper, dot-sourced by every other script in this folder.
# Resolves the project-local Node/npm/pnpm, prepends it to PATH for the current process
# only, and verifies the prepend actually took effect before any caller proceeds. Never
# touches the global Node install or system PATH. See docs/DEVELOPMENT-SETUP.md.
#
# IMPORTANT: this file only takes effect for processes that dot-source it (every
# scripts/*.ps1 does). A bare `pnpm` typed directly in an arbitrary shell, or a direct call
# to `.tools\node\corepack.cmd`/`.tools\node\pnpm.cmd` in a shell that hasn't sourced this
# file, is NOT covered by this guard. Use scripts/pnpm.ps1 (or another scripts/*.ps1) for
# any ad hoc command instead of invoking pnpm/corepack/node directly - see
# docs/DEVELOPMENT-SETUP.md, "Enforcing the project-local Node runtime".
#
# NOTE: keep this file (and every scripts/*.ps1) plain ASCII. Windows PowerShell 5.1
# reads .ps1 files without a UTF-8 BOM using the legacy system codepage, which can
# corrupt multi-byte characters (smart quotes, em dashes, arrows) inside string
# literals and produce confusing "string is missing the terminator" parse errors.

$script:RepoRoot = Split-Path -Parent $PSScriptRoot
$script:NodeDir = Join-Path $RepoRoot ".tools\node"
$script:ExpectedNodeMajor = 24

function Assert-ProjectLocalNode {
    $nodeExe = Join-Path $NodeDir "node.exe"
    if (-not (Test-Path $nodeExe)) {
        Write-Error "Project-local Node runtime not found at $NodeDir. Run .\scripts\setup.ps1 first."
        exit 1
    }

    $env:PATH = "$NodeDir;$env:PATH"

    # Verify the prepend actually resolves to the runtime we just pointed at, rather than
    # trusting that setting PATH was sufficient. This is what turns "should be on PATH
    # first" into a checked guarantee instead of an assumption.
    $resolved = Get-Command node -ErrorAction SilentlyContinue
    if (-not $resolved) {
        Write-Error "node did not resolve on PATH after prepending $NodeDir. Something is wrong with this shell's PATH handling."
        exit 1
    }

    $resolvedDir = (Split-Path $resolved.Source -Parent)
    if ($resolvedDir.TrimEnd('\') -ne $NodeDir.TrimEnd('\')) {
        Write-Error "node resolved from '$($resolved.Source)' instead of '$nodeExe' - a different Node install is still ahead of the project-local one on PATH. Refusing to continue with the wrong runtime."
        exit 1
    }

    $versionOutput = (& $resolved.Source --version).Trim()
    $actualMajor = [int]($versionOutput -replace '^v(\d+)\..*$', '$1')
    if ($actualMajor -lt 20) {
        Write-Error "Resolved project-local Node is $versionOutput, which is below the minimum (>=20) this project's frameworks require."
        exit 1
    }

    $script:ResolvedNodeVersion = $versionOutput
}
