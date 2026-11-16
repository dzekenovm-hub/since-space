$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$securePassword = Read-Host 'Enter your private SINCE SPACE admin password' -AsSecureString
$passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
try {
    $env:SS_ADMIN_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
    $env:HOST = '127.0.0.1'
    $env:PORT = '5174'
    Set-Location -LiteralPath $projectRoot
    $nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
    $nodePath = if ($nodeCommand) { $nodeCommand.Source } else { Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' }
    if (-not (Test-Path -LiteralPath $nodePath)) { throw 'Node.js was not found. Install Node.js 20 or newer from nodejs.org and restart this script.' }
    Write-Host 'SINCE SPACE is running. Open http://localhost:5174'
    & $nodePath serve.mjs
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
    Remove-Item Env:SS_ADMIN_PASSWORD -ErrorAction SilentlyContinue
    Remove-Item Env:HOST -ErrorAction SilentlyContinue
    Remove-Item Env:PORT -ErrorAction SilentlyContinue
}
