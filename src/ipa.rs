use std::fs::File;
use std::io::Read;

use anyhow::{Context, Result};
use zip::ZipArchive;

#[derive(Debug)]
pub struct BundleInfo {
    pub bundle_id: String,
    pub bundle_version: String,
    pub bundle_short_version: String,
    /// The .app bundle directory name, e.g. "MyApp.app"
    pub bundle_name: String,
    /// Full path of the mobileprovision inside the IPA, e.g. "Payload/MyApp.app/embedded.mobileprovision"
    pub mobile_provision_path: String,
    pub mobile_provision: Vec<u8>,
}

impl BundleInfo {
    pub fn extract(file: &File) -> Result<Self> {
        let mut archive = ZipArchive::new(file).context("Failed to open ZIP file")?;

        let mut info_plist_data = None;
        let mut info_plist_name = String::new();
        let mut mobile_provision_data = None;
        let mut mobile_provision_name = String::new();

        for i in 0..archive.len() {
            let mut entry = archive.by_index(i)?;
            let name = entry.name().to_string();

            if name.starts_with("Payload/")
                && name.ends_with(".app/Info.plist")
                && name.matches('/').count() == 2
            {
                let mut data = Vec::new();
                entry.read_to_end(&mut data)?;
                info_plist_name = name;
                info_plist_data = Some(data);
            } else if name.starts_with("Payload/")
                && name.ends_with(".app/embedded.mobileprovision")
                && name.matches('/').count() == 2
            {
                let mut data = Vec::new();
                entry.read_to_end(&mut data)?;
                mobile_provision_name = name;
                mobile_provision_data = Some(data);
            }
        }

        let info_plist_data =
            info_plist_data.context("Info.plist not found in IPA")?;
        let mobile_provision_data =
            mobile_provision_data.context("embedded.mobileprovision not found in IPA")?;

        // Extract .app bundle name from the Info.plist path
        // e.g. "Payload/MyApp.app/Info.plist" -> "MyApp.app"
        let bundle_name = std::path::Path::new(&info_plist_name)
            .parent()
            .and_then(|p| p.file_name())
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| "App.app".to_string());

        let plist: plist::Value =
            plist::from_bytes(&info_plist_data).context("Failed to parse Info.plist")?;

        let bundle_id = plist
            .as_dictionary()
            .and_then(|d| d.get("CFBundleIdentifier"))
            .and_then(|v| v.as_string())
            .context("CFBundleIdentifier not found in Info.plist")?
            .to_string();

        let bundle_version = plist
            .as_dictionary()
            .and_then(|d| d.get("CFBundleVersion"))
            .and_then(|v| v.as_string())
            .context("CFBundleVersion not found in Info.plist")?
            .to_string();

        let bundle_short_version = plist
            .as_dictionary()
            .and_then(|d| d.get("CFBundleShortVersionString"))
            .and_then(|v| v.as_string())
            .context("CFBundleShortVersionString not found in Info.plist")?
            .to_string();

        Ok(BundleInfo {
            bundle_id,
            bundle_version,
            bundle_short_version,
            bundle_name,
            mobile_provision_path: mobile_provision_name,
            mobile_provision: mobile_provision_data,
        })
    }
}