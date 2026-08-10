# Lifecycle wrapper for the local, project-local PostgreSQL server used for development.
# No admin rights, no Docker required - see docs/ADR/0003-local-postgresql-strategy.md.
#
# Usage: .\scripts\db.ps1 start|stop|status|reset

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\_env.ps1"
Assert-ProjectLocalNode
Import-DotEnv

$command = $args[0]
if (-not $command) {
    Write-Error "Usage: .\scripts\db.ps1 start|stop|status|reset"
    exit 1
}

Push-Location $RepoRoot
try {
    & "$NodeDir\corepack.cmd" pnpm --filter "@automationdm/database" run "db:$command"
    exit $LASTEXITCODE
}
finally {
    Pop-Location
}
