#!/bin/bash

# Example script to upload an iOS app using Docker

# Set your credentials
export USERNAME="your-apple-id@example.com"
export PASSWORD="your-app-specific-password"

# Build the Docker image
docker build -t ios-uploader .

# Run the uploader
docker run --rm \
  -e USERNAME="$USERNAME" \
  -e PASSWORD="$PASSWORD" \
  -v /path/to/your/app.ipa:/app/app.ipa \
  ios-uploader -u "$USERNAME" -p "$PASSWORD" -f /app/app.ipa