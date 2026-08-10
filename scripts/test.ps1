# Runs the workspace test suite using the project-local Node/pnpm.
# No package defines a "test" script yet (Phase 1 does not introduce a test runner) —
# --if-present makes this a no-op today rather than an error, and it starts doing real work
# the moment a package adds one.

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\_env.ps1"
Assert-ProjectLocalNode

Push-Location $RepoRoot
try {
    & "$NodeDir\corepack.cmd" pnpm run --recursive --if-present test
}
finally {
    Pop-Location
}
