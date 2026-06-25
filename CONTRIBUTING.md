# Contributing to ios-uploader

Thank you for your interest in contributing! Here are some guidelines to help you get started.

## Development Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/tasselx/ios-uploader.git
   cd ios-uploader
   ```

2. Install Rust 1.75 or later (https://rustup.rs)

3. Build the project:
   ```bash
   make build
   ```

4. Run tests:
   ```bash
   make test
   ```

## Code Style

- Follow standard Rust conventions
- Run `cargo clippy` before submitting
- Run `cargo fmt` to format code
- Add tests for new functionality

## Pull Request Process

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Run the test suite
6. Submit a pull request

## Reporting Issues

When reporting issues, please include:
- Rust version (`rustc --version`)
- Operating system
- Steps to reproduce
- Expected behavior
- Actual behavior

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
