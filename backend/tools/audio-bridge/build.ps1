$csc = "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
$src = Join-Path $PSScriptRoot "DeviceAudioBridge.cs"
$out = Join-Path $PSScriptRoot "device-audio-bridge.exe"

if (-not (Test-Path $csc)) {
    Write-Error "csc.exe compiler not found at $csc"
    exit 1
}

Write-Host "Compiling DeviceAudioBridge.cs..."
& $csc /optimize /out:$out $src

if ($LASTEXITCODE -eq 0) {
    Write-Host "Build succeeded: $out"
} else {
    Write-Error "Build failed."
}
