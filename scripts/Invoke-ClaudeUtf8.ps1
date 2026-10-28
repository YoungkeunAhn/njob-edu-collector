# ASCII source is intentional: Windows PowerShell 5 can read this without a BOM.
param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]] $NodeParameters
)

$ErrorActionPreference = 'Stop'
$utf8 = New-Object System.Text.UTF8Encoding($false)
$OutputEncoding = $utf8
[Console]::InputEncoding = $utf8
[Console]::OutputEncoding = $utf8

# Pass file paths and argument tokens only. Prompt text never enters a PS pipe.
$runner = Join-Path $PSScriptRoot 'claude-utf8.mjs'
& node $runner @NodeParameters
exit $LASTEXITCODE
