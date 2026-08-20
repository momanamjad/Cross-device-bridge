#!/bin/bash
set -e

# Configuration
NDK_PATH="/c/Users/DELL/android-sdk/ndk/25.1.8937393" # Ensure NDK is installed at this path
SDK_VERSION=28
ARCHS=("arm64" "arm")

echo "=== 1. Cloning Stremio node-android ==="
if [ ! -d "node-android" ]; then
    git clone --recursive https://github.com/Stremio/node-android.git
fi

cd node-android

echo "=== 2. Applying Patches ==="
./scripts/patch.sh

echo "=== 3. Building libnode.so ==="
for arch in "${ARCHS[@]}"; do
    echo "Building for $arch..."
    ./scripts/build.sh "$NDK_PATH" "$SDK_VERSION" "$arch"
    
    # Copy build output to Android project
    DEST_DIR="../../android/app/src/main/jniLibs"
    if [ "$arch" == "arm64" ]; then
        ABI_DIR="arm64-v8a"
    elif [ "$arch" == "arm" ]; then
        ABI_DIR="armeabi-v7a"
    fi
    
    mkdir -p "$DEST_DIR/$ABI_DIR"
    cp "bin/$arch/libnode.so" "$DEST_DIR/$ABI_DIR/"
    echo "Copied libnode.so for $arch to $DEST_DIR/$ABI_DIR/"
done

echo "=== Build finished! ==="
