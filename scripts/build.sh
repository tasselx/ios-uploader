#!/bin/bash

# Build script for ios-uploader

set -e

echo "Building ios-uploader"
echo ""

# Build for current platform
echo "▶ Building for current platform..."
cargo build --release
echo "   Done: target/release/ios-uploader"
echo ""

# Cross-compile for all platforms (requires cargo-zigbuild)
if command -v cargo-zigbuild &> /dev/null; then
    echo "▶ Cross-compiling for all platforms..."
    mkdir -p build

    rustup target add x86_64-unknown-linux-gnu aarch64-unknown-linux-gnu x86_64-apple-darwin aarch64-apple-darwin x86_64-pc-windows-gnu 2>/dev/null

    cargo zigbuild --release --target x86_64-unknown-linux-gnu
    cp target/x86_64-unknown-linux-gnu/release/ios-uploader build/ios-uploader-linux-amd64
    echo "   ✓ linux-amd64"

    cargo zigbuild --release --target aarch64-unknown-linux-gnu
    cp target/aarch64-unknown-linux-gnu/release/ios-uploader build/ios-uploader-linux-arm64
    echo "   ✓ linux-arm64"

    cargo zigbuild --release --target x86_64-apple-darwin
    cp target/x86_64-apple-darwin/release/ios-uploader build/ios-uploader-darwin-amd64
    echo "   ✓ darwin-amd64"

    cargo zigbuild --release --target aarch64-apple-darwin
    cp target/aarch64-apple-darwin/release/ios-uploader build/ios-uploader-darwin-arm64
    echo "   ✓ darwin-arm64"

    cargo zigbuild --release --target x86_64-pc-windows-gnu
    cp target/x86_64-pc-windows-gnu/release/ios-uploader.exe build/ios-uploader-windows-amd64.exe
    echo "   ✓ windows-amd64"

    echo ""
    echo "✅ All builds complete! Binaries in build/:"
    ls -lh build/
else
    echo "⚠  cargo-zigbuild not found. Install it: cargo install cargo-zigbuild"
    echo "   Then re-run this script for cross-platform builds."
fi
