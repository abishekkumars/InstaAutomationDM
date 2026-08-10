# Canonical entry point for any ad hoc pnpm command (installing a dependency in one
# workspace member, `pnpm --filter <pkg> run build`, `pnpm why <pkg>`, etc.).
#
# Never run `pnpm` bare, and never call `.tools\node\corepack.cmd pnpm` or
# `.tools\node\pnpm.cmd` directly - both bypass the PATH verification in scripts/_env.ps1
# and can silently spawn a workspace script's child process (next build, nest build, tsc,
# ...) under whichever `node` happens to be first on the current shell's PATH, which may
# still be this machine's global Node 16. See docs/DEVELOPMENT-SETUP.md, "Enforcing the
# project-local Node runtime", for how this was discovered.
#
# Usage: .\scripts\pnpm.ps1 --filter @automationdm/api run build
#        .\scripts\pnpm.ps1 install
#        .\scripts\pnpm.ps1 why some-package

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\_env.ps1"
Assert-ProjectLocalNode
Import-DotEnv

Push-Location $RepoRoot
try {
    & "$NodeDir\corepack.cmd" pnpm @Args
    exit $LASTEXITCODE
}
finally {
    Pop-Location
}
