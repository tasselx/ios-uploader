<h1 align="center">
<img src="icon.svg" height="128px" />
<p>ios-uploader</p>
</h1>
<p align="center">
  <a href="README.zh.md">🇨🇳 中文</a>
</p>
<p align="center">
<a href="https://github.com/tasselx/ios-uploader/releases"><img src="https://img.shields.io/github/v/release/tasselx/ios-uploader?style=flat-square"></a>
<a href="https://github.com/tasselx/ios-uploader/actions?query=workflow%3Aci+branch%3Amain"><img src="https://github.com/tasselx/ios-uploader/workflows/ci/badge.svg"></a>
</p>
<p align="center">
Easy to use, cross-platform tool to upload iOS apps to App Store Connect.
</p>

<br>

## Installation

### System Requirements
* **OS**: Windows, macOS or Linux
<br><br>

Download the latest binary for your platform from [releases](https://github.com/tasselx/ios-uploader/releases).

Or build from source:

```sh
cargo build --release
```

The binary will be at `./target/release/ios-uploader`.

Cross-compile for all platforms:

```sh
make build-all    # 自动安装 cargo-zigbuild（首次）
```

Binaries will be in the `build/` directory.

<br>

## Usage

Basic usage:

```sh
$ ios-uploader -u <username> -p <password> -f <path/to/app.ipa>
```

> **Note**<br>
> The password should be an app-specific password, not your standard Apple Account password.<br>
> More information: https://support.apple.com/en-us/HT204397

<br>

## Options

```
  -v, --version               output the current version and exit
  -u, --username <USERNAME>   your Apple ID
  -p, --password <PASSWORD>   app-specific password for your Apple ID
  -f, --file <FILE>           path to .ipa file for upload (local file or http(s):// URL)
  -c, --concurrency <N>       number of concurrent upload tasks to use (default: 4)
  -s, --status                display upload status and exit
  -h, --help                  output this help message and exit
```

<br>

## Docker

Build and run using Docker:

```sh
docker build -t ios-uploader .
docker run --rm -e USERNAME="your-apple-id" -e PASSWORD="your-password" -v /path/to/app.ipa:/app/app.ipa ios-uploader -u "$USERNAME" -p "$PASSWORD" -f /app/app.ipa
```

<br>

## Development

### Prerequisites

- Rust 1.75 or later

### Building

```sh
# Build for current platform
cargo build --release

# Run tests
cargo test

# Lint
cargo clippy

# Check compilation without building
cargo check
```

<br>

## Credits

This project is a Rust port of [simonnilsson/ios-uploader](https://github.com/simonnilsson/ios-uploader), originally written in Node.js and later migrated to Go.

<br>

## Disclaimer

This package is not endorsed by or in any way associated with Apple Inc. It is provided as is without warranty of any kind. The program may stop working at any time without prior notice if Apple decides to change the API.

<br>

## License

[MIT](LICENSE)
