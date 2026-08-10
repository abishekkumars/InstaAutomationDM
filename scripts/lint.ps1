# Runs ESLint + TypeScript typechecking across the workspace using the project-local Node/pnpm.

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\_env.ps1"
Assert-ProjectLocalNode

Push-Location $RepoRoot
try {
    & "$NodeDir\corepack.cmd" pnpm run --recursive lint
    & "$NodeDir\corepack.cmd" pnpm run --recursive typecheck
}
finally {
    Pop-Location
}
