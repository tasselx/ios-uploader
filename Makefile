.PHONY: build build-all clean test lint check setup-cross

build:
	cargo build --release

build-all: clean setup-zigbuild
	@echo "Building for all platforms with cargo-zigbuild..."
	rustup target add x86_64-unknown-linux-gnu aarch64-unknown-linux-gnu x86_64-apple-darwin aarch64-apple-darwin x86_64-pc-windows-gnu
	cargo zigbuild --release --target x86_64-unknown-linux-gnu
	cargo zigbuild --release --target aarch64-unknown-linux-gnu
	cargo zigbuild --release --target x86_64-apple-darwin
	cargo zigbuild --release --target aarch64-apple-darwin
	cargo zigbuild --release --target x86_64-pc-windows-gnu
	mkdir -p build
	cp target/x86_64-unknown-linux-gnu/release/ios-uploader build/ios-uploader-linux-amd64
	cp target/aarch64-unknown-linux-gnu/release/ios-uploader build/ios-uploader-linux-arm64
	cp target/x86_64-apple-darwin/release/ios-uploader build/ios-uploader-darwin-amd64
	cp target/aarch64-apple-darwin/release/ios-uploader build/ios-uploader-darwin-arm64
	cp target/x86_64-pc-windows-gnu/release/ios-uploader.exe build/ios-uploader-windows-amd64.exe
	@echo ""
	@echo "✅ All builds complete! Binaries in build/:"
	@ls -lh build/

setup-zigbuild:
	@if ! command -v cargo-zigbuild >/dev/null 2>&1; then \
		echo "Installing cargo-zigbuild..."; \
		cargo install cargo-zigbuild; \
	fi

clean:
	cargo clean
	rm -rf build/

test:
	cargo test

lint:
	cargo clippy -- -D warnings

check:
	cargo check
