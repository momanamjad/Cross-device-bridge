# Define ADB path
$adb = "C:\Users\DELL\android-sdk\platform-tools\adb.exe"

# 1. Build the APK
Write-Host "==============================================" -ForegroundColor Yellow
Write-Host "1/4 Building Android Debug APK..." -ForegroundColor Cyan
Write-Host "==============================================" -ForegroundColor Yellow

$env:JAVA_HOME="C:\Users\DELL\Desktop\device bridge\android\jdk17\jdk-17.0.12+7"
Push-Location android
.\gradlew assembleDebug
Pop-Location

if ($LASTEXITCODE -ne 0) {
    Write-Host "Build failed! Please check compilation errors above." -ForegroundColor Red
    exit $LASTEXITCODE
}

# Copy the fresh APK to root
Copy-Item -Path "android\app\build\outputs\apk\debug\app-debug.apk" -Destination "app-debug.apk" -Force

# 2. Check device connection
Write-Host ""
Write-Host "==============================================" -ForegroundColor Yellow
Write-Host "2/4 Checking connected devices..." -ForegroundColor Cyan
Write-Host "==============================================" -ForegroundColor Yellow

$devices = & $adb devices
Write-Host $devices

if ($devices.Count -le 2) {
    Write-Host "Warning: No device detected by ADB!" -ForegroundColor Red
    Write-Host "Please make sure your phone is connected, USB Debugging is ON in Developer Settings, and USB mode is set to 'File Transfer'." -ForegroundColor Yellow
    exit 1
}

# 3. Install APK
Write-Host ""
Write-Host "==============================================" -ForegroundColor Yellow
Write-Host "3/4 Installing app-debug.apk to device..." -ForegroundColor Cyan
Write-Host "==============================================" -ForegroundColor Yellow

& $adb install -r "app-debug.apk"

if ($LASTEXITCODE -ne 0) {
    Write-Host "Installation failed!" -ForegroundColor Red
    exit $LASTEXITCODE
}

# 4. Launch app
Write-Host ""
Write-Host "==============================================" -ForegroundColor Yellow
Write-Host "4/4 Launching app on device..." -ForegroundColor Cyan
Write-Host "==============================================" -ForegroundColor Yellow

& $adb shell am start -n com.momanamjad.smsbridge/com.momanamjad.smsbridge.ui.MainActivity

Write-Host ""
Write-Host "==============================================" -ForegroundColor Green
Write-Host "App launched successfully!" -ForegroundColor Green
Write-Host "Streaming real-time Android logs (Press Ctrl+C to exit logs)..." -ForegroundColor Green
Write-Host "==============================================" -ForegroundColor Green

& $adb logcat NodeJS-Native:I *:E
