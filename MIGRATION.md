# Migration History

This document describes the migration history of ios-uploader.

## Phase 1: Node.js (Original) → Go

The original implementation was in Node.js and was migrated to Go for smaller binaries,
faster startup, and simpler deployment.

## Phase 2: Go → Rust (Current)

The Go implementation was replaced with a Rust implementation for better performance,
memory safety, and reliability.

### Changes

- **Runtime**: Go → Rust
- **Build System**: go build → cargo build
- **CLI Framework**: cobra → clap
- **HTTP Client**: net/http → reqwest
- **Progress Bar**: schollz/progressbar → indicatif
- **Plist Parser**: howett.net/plist → plist
- **Zip Reader**: archive/zip → zip

### File Structure

```
ios-uploader/
├── Cargo.toml              # Rust project configuration
├── src/
│   ├── main.rs            # Entry point
│   ├── cli.rs             # CLI argument parsing
│   ├── api.rs             # API client (App Store Connect)
│   ├── api/
│   │   ├── context.rs     # API context/state
│   │   └── types.rs       # Shared types
│   ├── ipa.rs             # IPA file parsing
│   └── utils.rs           # Utility functions
├── Dockerfile             # Docker support (Rust-based)
├── Makefile               # Build automation (Rust-based)
├── scripts/
│   ├── build.sh           # Build script
│   └── test-binary.sh     # Binary test script
└── .github/workflows/
    ├── ci.yml             # CI workflow (Rust)
    └── release.yml        # Release workflow (Rust cross-compilation)
```

### Building

**Rust:**
```bash
cargo build --release
# or
make build
```

### Cross-Compilation

**Rust:** Via cargo with target triples
```bash
cargo build --release --target x86_64-unknown-linux-gnu
```

### Testing

**Rust:**
```bash
cargo test
# or
make test
```

## Benefits (Rust over Go)

1. **Memory safety**: Compile-time guarantees with ownership model
2. **Zero-cost abstractions**: No runtime overhead
3. **Better error handling**: Result/Option types with anyhow
4. **Async by default**: Built-in async/await with tokio
5. **Smaller binaries**: ~5-8MB vs ~8-12MB with Go
6. **Package ecosystem**: crates.io with rich library support

## Breaking Changes (Go → Rust)

1. Requires Rust toolchain (not Go) for source builds
2. Binary releases differ from Go binary releases
3. Error messages may differ slightly
