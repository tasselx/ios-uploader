#!/bin/bash

# Example script to upload an iOS app to App Store Connect

# Set your credentials
export USERNAME="your-apple-id@example.com"
export PASSWORD="your-app-specific-password"

# Path to your IPA file
IPA_PATH="/path/to/your/app.ipa"

# Run the uploader
./ios-uploader -u "$USERNAME" -p "$PASSWORD" -f "$IPA_PATH"