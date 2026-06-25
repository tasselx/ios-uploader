#!/bin/bash

# Test script for ios-uploader binary

set -e

BINARY=${1:-./target/release/ios-uploader}

echo "Testing binary: $BINARY"

# Check binary exists
if [ ! -f "$BINARY" ]; then
    echo "ERROR: Binary not found at $BINARY"
    echo "Build it first: cargo build --release"
    exit 1
fi

# Test help command
echo "Testing help command..."
$BINARY --help

# Test version command
echo "Testing version command..."
$BINARY --version

# Test missing required flags
echo "Testing missing required flags..."
if $BINARY 2>/dev/null; then
    echo "ERROR: Expected failure for missing flags"
    exit 1
else
    echo "OK: Correctly failed for missing flags"
fi

echo "All tests passed!"
