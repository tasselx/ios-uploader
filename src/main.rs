mod api;
mod cli;
mod ipa;
mod utils;

use std::process;

#[tokio::main]
async fn main() {
    if let Err(e) = cli::run().await {
        eprintln!("Error: {}", e);
        process::exit(1);
    }
}