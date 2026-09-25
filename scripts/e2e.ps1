# Runs the Playwright browser tests (tests/e2e) using the project-local Node/pnpm.
#
# Requires the dev stack to be running first (.\scripts\dev.ps1, with the local database started
# by .\scripts\db.ps1 start). The tests drive the installed Microsoft Edge, so no Playwright
# browser download is needed. They seed their own local-only user and "E2E (test data)"
# organization in the development database and never touch anything else - see
# tests/e2e/README.md.
#
# Usage: .\scripts\e2e.ps1
#        .\scripts\e2e.ps1 --project=mobile
#        .\scripts\e2e.ps1 --headed

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\_env.ps1"
Assert-ProjectLocalNode
Import-DotEnv

Push-Location $RepoRoot
try {
    & "$NodeDir\corepack.cmd" pnpm --filter "@automationdm/e2e" run e2e @Args
    exit $LASTEXITCODE
}
finally {
    Pop-Location
}
