$ErrorActionPreference = 'Stop'
# Official Evergreen detection: https://learn.microsoft.com/microsoft-edge/webview2/concepts/distribution
function Get-WebViewVersion {
    foreach ($key in @(
        'HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}',
        'HKLM:\SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}',
        'HKCU:\Software\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}'
    )) {
        $version = (Get-ItemProperty -LiteralPath $key -ErrorAction SilentlyContinue).pv
        if ($version -and $version -ne '0.0.0.0') { return $version }
    }
}
$version = Get-WebViewVersion
if (-not $version) {
    $bootstrapper = Join-Path $env:TEMP ('Aura-WebView2-' + [guid]::NewGuid() + '.exe')
    Invoke-WebRequest -Uri 'https://go.microsoft.com/fwlink/p/?LinkId=2124703' -OutFile $bootstrapper
    $signature = Get-AuthenticodeSignature -LiteralPath $bootstrapper
    if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'O=Microsoft Corporation') {
        throw 'The WebView2 bootstrapper does not have a valid Microsoft signature.'
    }
    $setup = Start-Process -FilePath $bootstrapper -ArgumentList '/silent','/install' -WindowStyle Hidden -Wait -PassThru
    $version = Get-WebViewVersion
    if (-not $version) { throw "WebView2 installation failed (exit $($setup.ExitCode))." }
}
Write-Output "WebView2 Evergreen runtime: $version"
