<h1 align="center">
<img src="icon.svg" height="128px" />
<p>ios-uploader</p>
</h1>
<p align="center">
<a href="https://github.com/tasselx/ios-uploader/releases"><img src="https://img.shields.io/github/v/release/tasselx/ios-uploader?style=flat-square"></a>
<a href="https://github.com/tasselx/ios-uploader/actions?query=workflow%3Aci+branch%3Amain"><img src="https://github.com/tasselx/ios-uploader/workflows/ci/badge.svg"></a>
</p>
<p align="center">
简单易用的跨平台工具，用于将 iOS 应用上传到 App Store Connect。
</p>

<br>

## 安装

### 系统要求
* **操作系统**：Windows、macOS 或 Linux
<br><br>

从 [Releases](https://github.com/tasselx/ios-uploader/releases) 下载最新二进制文件。

或从源码构建：

```sh
cargo build --release
```

二进制文件位于 `./target/release/ios-uploader`。

一键编译全部平台：

```sh
make build-all    # 首次会自动安装 cargo-zigbuild
```

编译产物在 `build/` 目录下。

<br>

## 使用方法

基本用法：

```sh
$ ios-uploader -u <用户名> -p <密码> -f <路径/app.ipa>
```

> **注意**<br>
> 密码应使用 Apple ID 专用密码，而非你的 Apple 账户密码。<br>
> 更多信息：https://support.apple.com/zh-cn/HT204397

<br>

## 选项说明

```
  -v, --version               输出版本号并退出
  -u, --username <USERNAME>   你的 Apple ID
  -p, --password <PASSWORD>   Apple ID 专用密码
  -f, --file <FILE>           .ipa 文件路径（支持本地文件或 http(s):// 下载链接）
  -c, --concurrency <N>       并发上传任务数（默认：4）
  -s, --status                仅查看上传状态并退出
  -h, --help                  显示帮助信息并退出
```

<br>

## Docker

使用 Docker 构建和运行：

```sh
docker build -t ios-uploader .
docker run --rm -e USERNAME="your-apple-id" -e PASSWORD="your-password" -v /path/to/app.ipa:/app/app.ipa ios-uploader -u "$USERNAME" -p "$PASSWORD" -f /app/app.ipa
```

<br>

## 开发

### 环境要求

- Rust 1.75 或更高版本

### 构建

```sh
# 编译当前平台
cargo build --release

# 运行测试
cargo test

# 代码检查
cargo clippy

# 快速检查编译（不生成二进制）
cargo check
```

<br>

## 致谢

本项目是 [simonnilsson/ios-uploader](https://github.com/simonnilsson/ios-uploader) 的 Rust 移植版，原项目最初用 Node.js 编写，后迁移至 Go。

<br>

## 免责声明

本工具与 Apple Inc. 无关，未经 Apple 认可。按现状提供，不提供任何形式的担保。如果 Apple 更改 API，程序可能随时停止工作，恕不另行通知。

<br>

## 许可证

[MIT](LICENSE)
