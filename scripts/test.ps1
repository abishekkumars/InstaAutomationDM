# Runs the workspace test suite using the project-local Node/pnpm.

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\_env.ps1"
Assert-ProjectLocalNode

Push-Location $RepoRoot
try {
    & "$NodeDir\corepack.cmd" pnpm run --recursive test
}
finally {
    Pop-Location
}
