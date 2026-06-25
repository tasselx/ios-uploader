use std::fs::File;

use anyhow::{Context, Result};
use clap::Parser;
use indicatif::{ProgressBar, ProgressStyle};

use crate::api::Client;
use crate::ipa::BundleInfo;
use crate::utils;

#[derive(Parser, Debug)]
#[command(name = "ios-uploader")]
#[command(version)]
#[command(about = "Upload iOS app to iTunes Connect", long_about = None)]
struct Args {
    /// Your Apple ID
    #[arg(short, long)]
    username: String,

    /// App-specific password for your Apple ID
    #[arg(short, long)]
    password: String,

    /// Path to .ipa file for upload (local file or http(s):// URL)
    #[arg(short, long)]
    file: String,

    /// Number of concurrent upload tasks to use
    #[arg(short, long, default_value_t = 4)]
    concurrency: usize,

    /// Display upload status and exit
    #[arg(short, long)]
    status: bool,
}

pub async fn run() -> Result<()> {
    let args = Args::parse();

    let is_url = args.file.starts_with("http://") || args.file.starts_with("https://");

    let (file, temp_path) = if is_url {
        println!("Downloading file...");
        let pb = ProgressBar::new(0);
        pb.set_style(
            ProgressStyle::default_bar()
                .template("{msg} [{bar:20}] {bytes}/{total_bytes} ({eta})")
                .unwrap()
                .progress_chars("=> "),
        );
        pb.set_message("Downloading");

        let (file, path) = utils::download_temp_file(&args.file, |current, total| {
            if pb.length() == Some(0) || pb.length().is_none() {
                pb.set_length(total as u64);
            }
            pb.set_position(current as u64);
        })
        .await
        .context("Could not download file")?;

        pb.finish_with_message("Downloaded");
        (file, Some(path))
    } else {
        let file = File::open(&args.file).context("Could not open file")?;
        (file, None)
    };

    // Extract bundle info
    let bundle_info = BundleInfo::extract(&file)
        .context("Failed to extract Bundle ID and version, are you supplying a valid IPA-file?")?;

    println!(
        "Found Bundle ID \"{}\", Version {} ({}).",
        bundle_info.bundle_id, bundle_info.bundle_version, bundle_info.bundle_short_version
    );

    // Create API client
    let mut client = Client::new(
        &args.username,
        &args.password,
        &args.file,
        file,
        args.concurrency,
        args.status,
        bundle_info,
    );

    // Authenticate
    client.authenticate().await?;
    client.generate_token().await?;
    client.lookup_app().await?;

    println!(
        "Identified application as \"{}\" ({}).",
        client.ctx.app_name, client.ctx.apple_id
    );

    // Generate asset description
    client.generate_asset_description().await?;

    // Check existing builds
    let existing_build = client.check_builds().await?;

    if let Some(build) = &existing_build {
        if args.status {
            println!(
                "Build version {} is uploaded with state: {}",
                client.ctx.bundle_version, build.processing_state
            );
            return Ok(());
        } else {
            anyhow::bail!(
                "A build with version {} is already uploaded with state: {}",
                client.ctx.bundle_version,
                build.processing_state
            );
        }
    }

    if args.status {
        println!(
            "No existing upload with version {} found.",
            client.ctx.bundle_version
        );
        return Ok(());
    }

    // Register build
    client.register_build().await?;
    client.register_asset_description().await?;
    client.register_asset().await?;

    // Upload
    let pb = ProgressBar::new(0);
    pb.set_style(
        ProgressStyle::default_bar()
            .template("{msg} [{bar:20}] {bytes}/{total_bytes} ({bytes_per_sec})")
            .unwrap()
            .progress_chars("=> "),
    );
    pb.set_message("Uploading");
    pb.set_length((client.ctx.asset_desc_size + client.ctx.file_size) as u64);

    client.upload_asset_description(|bytes| {
        pb.set_position(bytes as u64);
    }).await?;

    let asset_desc_size = client.ctx.asset_desc_size;
    client.upload_asset(|bytes| {
        pb.set_position((asset_desc_size + bytes) as u64);
    }).await?;

    pb.finish_with_message("Upload completed");

    // Cleanup temp file
    if let Some(path) = temp_path {
        let _ = std::fs::remove_file(path);
    }

    Ok(())
}