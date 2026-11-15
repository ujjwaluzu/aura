$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true') { throw 'This helper is only for the disposable GitHub Actions runner.' }
# Runtime 150+ intentionally ignores debugging environment flags in elevated
# hosts. Run tests at Medium integrity, as recommended by Wry maintainers:
# https://github.com/tauri-apps/wry/issues/1782
$toolsDirectory = Join-Path $env:RUNNER_TEMP ('aura-native-' + [guid]::NewGuid())
New-Item -ItemType Directory -Path $toolsDirectory | Out-Null
$archive = Join-Path $toolsDirectory 'gsudo.zip'
Invoke-WebRequest -Uri 'https://github.com/gerardog/gsudo/releases/download/v2.6.1/gsudo.portable.zip' -OutFile $archive
if ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant() -ne '21130bf178d7b9891207f00bff56f05b6b363ce9cec7b2d084e45fb12ee51f44') {
    throw 'The pinned gsudo portable archive checksum does not match.'
}
Expand-Archive -LiteralPath $archive -DestinationPath (Join-Path $toolsDirectory 'portable')
$gsudo = Join-Path $toolsDirectory 'portable\x64\gsudo.exe'
if (-not (Test-Path -LiteralPath $gsudo)) { throw 'Missing pinned x64 gsudo executable.' }
# Only the current runner identity receives workspace Modify access. This lets
# its non-elevated token write test profiles; no machine-wide policy is changed.
$workspace = [IO.Path]::GetFullPath($env:GITHUB_WORKSPACE)
if ($workspace -ne (Get-Location).Path) { throw 'Workspace access must be scoped to the checked-out repository.' }
$runnerSid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
& icacls.exe $workspace /grant "*${runnerSid}:(OI)(CI)M" /T /Q
if ($LASTEXITCODE -ne 0) { throw 'Could not grant the current runner access for non-elevated tests.' }
"AURA_NATIVE_GSUDO=$gsudo" | Out-File -FilePath $env:GITHUB_ENV -Encoding utf8 -Append
whoami.exe /groups /fo csv /nh | Select-String 'S-1-16-'
