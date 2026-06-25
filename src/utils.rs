use std::fs::File;
use std::io::{Read, Seek, SeekFrom, Write};
use std::time::{SystemTime, UNIX_EPOCH};

use anyhow::{Context, Result};
use md5::{Digest, Md5};
use tempfile::NamedTempFile;

pub fn generate_id_string() -> String {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    let secs = now.as_secs();
    let millis = now.subsec_millis();

    let offset = chrono::FixedOffset::east_opt(0).unwrap();
    let datetime = chrono::DateTime::from_timestamp(secs as i64, 0)
        .unwrap_or_default()
        .with_timezone(&offset);
    format!("{}-{:03}", datetime.format("%Y%m%d%H%M%S"), millis)
}

pub fn make_session_digest(
    session_id: &str,
    request_checksum: &[u8],
    request_id: &str,
    shared_secret: &str,
) -> String {
    let mut hasher = Md5::new();
    hasher.update(session_id.as_bytes());
    hasher.update(request_checksum);
    hasher.update(request_id.as_bytes());
    hasher.update(shared_secret.as_bytes());
    format!("{:x}", hasher.finalize())
}

pub fn get_file_md5(file: &mut File) -> Result<String> {
    let mut hasher = Md5::new();
    let mut buf = [0u8; 8192];

    file.seek(SeekFrom::Start(0))?;

    loop {
        let n = file.read(&mut buf).context("Failed to read file")?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }

    file.seek(SeekFrom::Start(0))?;

    Ok(format!("{:x}", hasher.finalize()))
}

pub async fn download_temp_file<F: Fn(usize, usize)>(
    url: &str,
    on_progress: F,
) -> Result<(File, String)> {
    let resp = reqwest::get(url)
        .await
        .context("Failed to fetch URL")?;

    if !resp.status().is_success() {
        anyhow::bail!("Failed to fetch {}: {}", url, resp.status());
    }

    let total = resp.content_length().unwrap_or(0) as usize;
    let mut downloaded = 0;

    let mut tmp_file = NamedTempFile::new().context("Failed to create temp file")?;
    let path = tmp_file.path().to_string_lossy().to_string();

    let mut stream = resp.bytes_stream();
    use futures_util::StreamExt;

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.context("Failed to read chunk")?;
        tmp_file.write_all(&chunk).context("Failed to write chunk")?;
        downloaded += chunk.len();
        on_progress(downloaded, total);
    }

    let file = tmp_file.into_file();
    Ok((file, path))
}