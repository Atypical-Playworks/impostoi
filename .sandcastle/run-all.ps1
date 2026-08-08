$ErrorActionPreference = "Stop"

for ($cycle = 1; $cycle -le 10; $cycle++) {
  Write-Output "=== Sandcastle cycle $cycle/10 ==="
  bun run .sandcastle/main.mts
  if ($LASTEXITCODE -ne 0) {
    throw "Sandcastle failed on cycle $cycle with exit code $LASTEXITCODE"
  }
}
