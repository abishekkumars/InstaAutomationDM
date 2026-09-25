# Runs the workspace test suite using the project-local Node/pnpm.
#
# The suites never touch the development database: the database and API tests delete every row
# in beforeEach, so they run against a separate `*_test` database (TEST_DATABASE_URL, or
# DATABASE_URL's database name plus "_test" when it points at localhost). This script creates
# that database if it is missing and migrates it first. See docs/TESTING.md and
# packages/database/dev/test-database.mjs.

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\_env.ps1"
Assert-ProjectLocalNode
Import-DotEnv

Push-Location $RepoRoot
try {
    & "$NodeDir\corepack.cmd" pnpm --filter "@automationdm/database" run test:prepare
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Could not prepare the test database - see the output above."
        exit $LASTEXITCODE
    }

    & "$NodeDir\corepack.cmd" pnpm run --recursive --if-present test
    exit $LASTEXITCODE
}
finally {
    Pop-Location
}
