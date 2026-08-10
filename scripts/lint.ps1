# Runs ESLint, TypeScript typechecking, and a Prettier format check across the workspace
# using the project-local Node/pnpm. Mirrors what .github/workflows/ci.yml runs.

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\_env.ps1"
Assert-ProjectLocalNode

Push-Location $RepoRoot
try {
    & "$NodeDir\corepack.cmd" pnpm run eslint
    & "$NodeDir\corepack.cmd" pnpm run typecheck
    & "$NodeDir\corepack.cmd" pnpm run format:check
}
finally {
    Pop-Location
}
