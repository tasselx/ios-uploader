<h1 align="center">
<img src="icon.svg" height="128px" />
<p>ios-uploader</p>
</h1>
<p align="center">
<a href="https://www.npmjs.org/package/ios-uploader"><img src="https://img.shields.io/npm/v/ios-uploader.svg?style=flat-square"></a>
<a href="https://packagephobia.com/result?p=ios-uploader"><img src="https://packagephobia.com/badge?p=ios-uploader"></a>
<a href="https://github.com/simonnilsson/ios-uploader/actions?query=workflow%3Aci+branch%3Amain"><img src="https://github.com/simonnilsson/ios-uploader/workflows/ci/badge.svg"></a>
<a href="https://coveralls.io/github/simonnilsson/ios-uploader?branch=main"><img src="https://coveralls.io/repos/github/simonnilsson/ios-uploader/badge.svg?branch=main"></a>
</p>
<p align="center">
Easy to use, cross-platform tool to upload iOS apps to App Store Connect.
</p>

<br>

## Installation

### System Requirements
* **OS**: Windows, macOS or Linux
* **Node.js**: v20 or newer (bundled with standalone binaries)
<br><br>

If you have Node.js and npm installed the simplest way is to just install the package globally.<br> The tool will automatically be added to your PATH as `ios-uploader`.

```sh
npm install -g ios-uploader
```

The program is also available as standalone binaries for all major OS:es on [github.com](https://github.com/simonnilsson/ios-uploader/releases).

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
  -u, --username <string>     your Apple ID
  -p, --password <string>     app-specific password for your Apple ID
  -f, --file <string>         path to .ipa file for upload (local file or http(s):// URL)
  -c, --concurrency <number>  number of concurrent upload tasks to use (default: 4)
  -h, --help                  output this help message and exit
```

<br>

## Disclaimer

This package is not endorsed by or in any way associated with Apple Inc. It is provided as is without warranty of any kind. The program may stop working at any time without prior notice if Apple decides to change the API.

<br>

## License

[MIT](LICENSE)