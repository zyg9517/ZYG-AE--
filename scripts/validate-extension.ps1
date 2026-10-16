# Optional wrapper only; use npm.cmd run validate if local policy blocks .ps1.
& node (Join-Path $PSScriptRoot 'validate-extension.js') @args
exit $LASTEXITCODE
