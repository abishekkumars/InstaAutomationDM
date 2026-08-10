# Runs the local dev stack (web + api + worker) using the project-local Node/pnpm.
# Requires .\scripts\setup.ps1 to have been run at least once, and (per
# docs/DEVELOPMENT-SETUP.md) a local Postgres/Redis reachable via .env's DATABASE_URL/REDIS_URL.

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\_env.ps1"
Assert-ProjectLocalNode

Push-Location $RepoRoot
try {
    & "$NodeDir\corepack.cmd" pnpm run --parallel --recursive dev
}
finally {
    Pop-Location
}
