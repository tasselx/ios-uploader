mod context;
mod types;

use std::fs::File;
use std::io::{Read, Seek, SeekFrom};

use anyhow::{Context, Result};
use base64::Engine;
use md5::{Digest, Md5};
use reqwest::Client as HttpClient;
use serde_json::{json, Value};

use crate::ipa::BundleInfo;
use crate::utils;
pub use context::Context as UploadContext;
pub use types::*;

const SOFTWARE_SERVICE_URL: &str =
    "https://contentdelivery.itunes.apple.com/WebObjects/MZLabelService.woa/json/MZITunesSoftwareService";
const USER_AGENT: &str = "iTMSTransporter/4.2.0";

pub struct Client {
    pub ctx: UploadContext,
    http: HttpClient,
}

impl Client {
    pub fn new(
        username: &str,
        password: &str,
        file_path: &str,
        file: File,
        concurrency: usize,
        status: bool,
        bundle_info: BundleInfo,
    ) -> Self {
        let file_size = file.metadata().map(|m| m.len()).unwrap_or(0);

        Self {
            ctx: UploadContext {
                username: username.to_string(),
                password: password.to_string(),
                file_path: file_path.to_string(),
                file: Some(file),
                file_size: file_size as usize,
                concurrency,
                status,
                bundle_id: bundle_info.bundle_id,
                bundle_version: bundle_info.bundle_version,
                bundle_short_version: bundle_info.bundle_short_version,
                bundle_name: bundle_info.bundle_name,
                mobile_provision_path: bundle_info.mobile_provision_path,
                mobile_provision: bundle_info.mobile_provision,
                ..Default::default()
            },
            http: HttpClient::builder()
                .user_agent(USER_AGENT)
                .build()
                .unwrap(),
        }
    }

    async fn make_software_request(
        &self,
        method: &str,
        params: Value,
    ) -> Result<Value> {
        let request_id = utils::generate_id_string();

        let body = json!({
            "jsonrpc": "2.0",
            "method": method,
            "id": request_id,
            "params": params
        });

        let body_str = serde_json::to_string(&body)?;
        let checksum = Md5::digest(body_str.as_bytes());

        let mut req = self.http.post(SOFTWARE_SERVICE_URL).body(body_str);

        req = req
            .header("User-Agent", USER_AGENT)
            .header("Content-Type", "application/json");

        if !self.ctx.session_id.is_empty() {
            let digest = utils::make_session_digest(
                &self.ctx.session_id,
                &checksum,
                &request_id,
                &self.ctx.shared_secret,
            );
            req = req
                .header("x-request-id", &request_id)
                .header("x-session-digest", &digest)
                .header("x-session-id", &self.ctx.session_id)
                .header("x-session-version", "2");
        }

        let resp = req.send().await.context("Request failed")?;
        let resp_body: Value = resp.json().await.context("Failed to parse response")?;

        Ok(resp_body)
    }

    async fn make_ds_request(
        &self,
        method: &str,
        path: &str,
        data: Option<Value>,
    ) -> Result<reqwest::Response> {
        let url = format!(
            "https://contentdelivery.itunes.apple.com/MZContentDeliveryService/iris/provider/{}/v1/{}",
            self.ctx.provider_public_id, path
        );

        let mut req = match method {
            "GET" => self.http.get(&url),
            "POST" => self.http.post(&url),
            "PATCH" => self.http.patch(&url),
            _ => anyhow::bail!("Unsupported HTTP method: {}", method),
        };

        req = req
            .header("User-Agent", USER_AGENT)
            .header("Content-Type", "application/json")
            .header(
                "Cookie",
                format!("{}={}", self.ctx.ds_token_name, self.ctx.ds_token),
            );

        if let Some(d) = data {
            req = req.json(&json!({ "data": d }));
        }

        Ok(req.send().await.context("Request failed")?)
    }

    pub async fn authenticate(&mut self) -> Result<()> {
        let resp = self
            .make_software_request(
                "authenticateForSession",
                json!({
                    "Username": self.ctx.username,
                    "Password": self.ctx.password
                }),
            )
            .await?;

        let result = &resp["result"];
        let session_id = result["SessionId"].as_str().unwrap_or_default();
        let shared_secret = result["SharedSecret"].as_str().unwrap_or_default();

        if session_id.is_empty() || shared_secret.is_empty() {
            let error = result["ErrorMessage"].as_str().unwrap_or("Unknown error");
            anyhow::bail!("Authentication failed!\n{}", error);
        }

        self.ctx.session_id = session_id.to_string();
        self.ctx.shared_secret = shared_secret.to_string();

        Ok(())
    }

    pub async fn generate_token(&mut self) -> Result<()> {
        let resp = self
            .make_software_request(
                "generateAppleConnectToken",
                json!({
                    "Username": self.ctx.username,
                    "Password": self.ctx.password
                }),
            )
            .await?;

        let result = &resp["result"];
        let ds_token = result["DSToken"].as_str().unwrap_or_default();
        let ds_token_name = result["DSTokenCookieName"].as_str().unwrap_or_default();

        if ds_token.is_empty() || ds_token_name.is_empty() {
            let error = result["ErrorMessage"].as_str().unwrap_or("Unknown error");
            anyhow::bail!("Authentication failed!\n{}", error);
        }

        self.ctx.ds_token = ds_token.to_string();
        self.ctx.ds_token_name = ds_token_name.to_string();

        Ok(())
    }

    pub async fn lookup_app(&mut self) -> Result<()> {
        let resp = self
            .make_software_request(
                "lookupSoftwareForBundleId",
                json!({
                    "BundleId": self.ctx.bundle_id
                }),
            )
            .await?;

        let result = &resp["result"];
        let success = result["Success"].as_bool().unwrap_or(false);
        let attributes = result["Attributes"].as_array();

        if !success || attributes.map_or(true, |a| a.is_empty()) {
            let error = result["ErrorMessage"].as_str().unwrap_or("Unknown error");
            anyhow::bail!("Application lookup failed!\n{}", error);
        }

        let attrs = &attributes.unwrap()[0];
        self.ctx.provider_public_id = result["ProviderPublicId"]
            .as_str()
            .unwrap_or_default()
            .to_string();
        self.ctx.apple_id = attrs["AppleID"].as_str().unwrap_or_default().to_string();
        self.ctx.app_name = attrs["Application"]
            .as_str()
            .unwrap_or_default()
            .to_string();
        self.ctx.app_icon_url = attrs["IconURL"]
            .as_str()
            .unwrap_or_default()
            .to_string();

        Ok(())
    }

    pub async fn generate_asset_description(&mut self) -> Result<()> {
        // Sanitize file name: replace colons and spaces with underscores (matching Node.js behavior)
        let file_name = std::path::Path::new(&self.ctx.file_path)
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string()
            .replace(':', "_")
            .replace(' ', "_");

        self.ctx.file_name = file_name;
        self.ctx.file_checksum = utils::get_file_md5(
            self.ctx.file.as_mut().context("File not available")?,
        )?;

        // Compute mobileprovision path relative to Payload directory
        // e.g. "Payload/MyApp.app/embedded.mobileprovision" -> "MyApp.app/embedded.mobileprovision"
        let provision_rel_path = self
            .ctx
            .mobile_provision_path
            .strip_prefix("Payload/")
            .unwrap_or(&self.ctx.mobile_provision_path)
            .to_string();

        let plist_data = json!({
            "product-metadata": {
                "archive-bytes": self.ctx.file_size,
                "file-name": self.ctx.file_name,
                "packages": [{
                    "bundles": [{
                        "CFBundleShortVersionString": self.ctx.bundle_short_version,
                        "CFBundleVersion": self.ctx.bundle_version,
                        "bundle-identifier": self.ctx.bundle_id,
                        "bundle-path": self.ctx.bundle_name,
                        "bundles": [],
                        "icons": [],
                        "platform-display-name": "iOS App",
                        "platform-id": 1
                    }],
                    "files": [{
                        "file-size": self.ctx.mobile_provision.len(),
                        "file-type": "NSFileTypeRegular",
                        "file-data": base64::engine::general_purpose::STANDARD.encode(&self.ctx.mobile_provision),
                        "uti": "com.apple.mobileprovision",
                        "path": provision_rel_path
                    }]
                }]
            }
        });

        let mut buf = Vec::new();
        plist::to_writer_binary(&mut buf, &plist_data)
            .context("Failed to create asset description")?;
        self.ctx.asset_description = buf;
        self.ctx.asset_desc_size = self.ctx.asset_description.len();
        self.ctx.asset_desc_checksum = format!("{:x}", Md5::digest(&self.ctx.asset_description));

        Ok(())
    }

    pub async fn check_builds(&self) -> Result<Option<Build>> {
        let path = format!(
            "builds?filter[app]={}&filter[version]={}",
            self.ctx.apple_id, self.ctx.bundle_version
        );

        let resp = self.make_ds_request("GET", &path, None).await?;

        if resp.status() != 200 {
            anyhow::bail!("Failed to lookup existing build!");
        }

        let body: Value = resp.json().await?;
        let data = body["data"].as_array().cloned().unwrap_or_default();

        let state_order = vec![
            "WAITING_FOR_UPLOAD",
            "PROCESSING",
            "FAILED",
            "INVALID",
            "VALID",
        ];

        let mut best_build: Option<Build> = None;
        let mut best_state_idx: i32 = -1;

        for item in &data {
            let state = item["attributes"]["processingState"]
                .as_str()
                .unwrap_or("WAITING_FOR_UPLOAD");

            if let Some(idx) = state_order.iter().position(|&s| s == state) {
                if idx as i32 > best_state_idx {
                    best_state_idx = idx as i32;
                    best_build = Some(Build {
                        id: item["id"].as_str().unwrap_or_default().to_string(),
                        processing_state: state.to_string(),
                    });
                }
            }
        }

        Ok(best_build)
    }

    pub async fn register_build(&mut self) -> Result<()> {
        let resp = self
            .make_ds_request(
                "POST",
                "builds",
                Some(json!({
                    "attributes": {
                        "cfBundleShortVersionString": self.ctx.bundle_short_version,
                        "cfBundleVersion": self.ctx.bundle_version,
                        "platform": "IOS"
                    },
                    "relationships": {
                        "app": {
                            "data": {
                                "id": self.ctx.apple_id,
                                "type": "apps"
                            }
                        }
                    },
                    "type": "builds"
                })),
            )
            .await?;

        if resp.status() != 201 {
            anyhow::bail!("Build registration failed!");
        }

        let body: Value = resp.json().await?;
        self.ctx.current_build = Some(Build {
            id: body["data"]["id"].as_str().unwrap_or_default().to_string(),
            processing_state: String::new(),
        });

        Ok(())
    }

    pub async fn register_asset_description(&mut self) -> Result<()> {
        let resp = self
            .make_ds_request(
                "POST",
                "buildDeliveryFiles",
                Some(json!({
                    "attributes": {
                        "assetType": "ASSET_DESCRIPTION",
                        "fileName": "AppStoreInfo.plist",
                        "fileSize": self.ctx.asset_desc_size,
                        "sourceFileChecksum": self.ctx.asset_desc_checksum,
                        "uti": "com.apple.binary-property-list"
                    },
                    "relationships": {
                        "build": {
                            "data": {
                                "id": self.ctx.current_build.as_ref().unwrap().id,
                                "type": "builds"
                            }
                        }
                    },
                    "type": "buildDeliveryFiles"
                })),
            )
            .await?;

        if resp.status() != 201 {
            anyhow::bail!("Failed to register asset description delivery file!");
        }

        let body: Value = resp.json().await?;
        self.ctx.asset_desc_delivery_id = body["data"]["id"]
            .as_str()
            .unwrap_or_default()
            .to_string();

        let ops = body["data"]["attributes"]["uploadOperations"]
            .as_array()
            .cloned()
            .unwrap_or_default();

        self.ctx.asset_desc_ops = ops
            .iter()
            .map(|op| UploadOperation {
                url: op["url"].as_str().unwrap_or_default().to_string(),
                method: op["method"].as_str().unwrap_or_default().to_string(),
                offset: op["offset"].as_u64().unwrap_or(0) as usize,
                length: op["length"].as_u64().unwrap_or(0) as usize,
                request_headers: op["requestHeaders"]
                    .as_array()
                    .cloned()
                    .unwrap_or_default()
                    .iter()
                    .map(|h| RequestHeader {
                        name: h["name"].as_str().unwrap_or_default().to_string(),
                        value: h["value"].as_str().unwrap_or_default().to_string(),
                    })
                    .collect(),
            })
            .collect();

        Ok(())
    }

    pub async fn register_asset(&mut self) -> Result<()> {
        let resp = self
            .make_ds_request(
                "POST",
                "buildDeliveryFiles",
                Some(json!({
                    "attributes": {
                        "assetType": "ASSET",
                        "fileName": self.ctx.file_name,
                        "fileSize": self.ctx.file_size,
                        "sourceFileChecksum": self.ctx.file_checksum,
                        "uti": "com.apple.ipa"
                    },
                    "relationships": {
                        "build": {
                            "data": {
                                "id": self.ctx.current_build.as_ref().unwrap().id,
                                "type": "builds"
                            }
                        }
                    },
                    "type": "buildDeliveryFiles"
                })),
            )
            .await?;

        if resp.status() != 201 {
            anyhow::bail!("Failed to register asset delivery file!");
        }

        let body: Value = resp.json().await?;
        self.ctx.asset_delivery_id = body["data"]["id"]
            .as_str()
            .unwrap_or_default()
            .to_string();

        let ops = body["data"]["attributes"]["uploadOperations"]
            .as_array()
            .cloned()
            .unwrap_or_default();

        self.ctx.asset_ops = ops
            .iter()
            .map(|op| UploadOperation {
                url: op["url"].as_str().unwrap_or_default().to_string(),
                method: op["method"].as_str().unwrap_or_default().to_string(),
                offset: op["offset"].as_u64().unwrap_or(0) as usize,
                length: op["length"].as_u64().unwrap_or(0) as usize,
                request_headers: op["requestHeaders"]
                    .as_array()
                    .cloned()
                    .unwrap_or_default()
                    .iter()
                    .map(|h| RequestHeader {
                        name: h["name"].as_str().unwrap_or_default().to_string(),
                        value: h["value"].as_str().unwrap_or_default().to_string(),
                    })
                    .collect(),
            })
            .collect();

        Ok(())
    }

    pub async fn upload_asset_description<F: Fn(usize)>(&mut self, on_progress: F) -> Result<()> {
        for op in &self.ctx.asset_desc_ops {
            let data = &self.ctx.asset_description[op.offset..op.offset + op.length];
            self.execute_upload(op, data).await?;
            on_progress(op.offset + op.length);
        }
        self.mark_uploaded(&self.ctx.asset_desc_delivery_id.clone())
            .await
    }

    pub async fn upload_asset<F: Fn(usize)>(&mut self, on_progress: F) -> Result<()> {
        let ops = self.ctx.asset_ops.clone();
        for op in &ops {
            let data = {
                let file = self.ctx.file.as_mut().context("File not available")?;
                let mut buf = vec![0u8; op.length];
                file.seek(SeekFrom::Start(op.offset as u64))?;
                file.read_exact(&mut buf)?;
                buf
            };
            self.execute_upload(op, &data).await?;
            on_progress(op.offset + op.length);
        }
        self.mark_uploaded(&self.ctx.asset_delivery_id.clone())
            .await
    }

    async fn execute_upload(&self, op: &UploadOperation, data: &[u8]) -> Result<()> {
        let mut req = match op.method.as_str() {
            "PUT" => self.http.put(&op.url),
            "POST" => self.http.post(&op.url),
            "PATCH" => self.http.patch(&op.url),
            _ => self.http.request(
                op.method.parse().unwrap_or(http::Method::GET),
                &op.url,
            ),
        };

        req = req.header("User-Agent", USER_AGENT);
        for header in &op.request_headers {
            req = req.header(&header.name, &header.value);
        }

        let resp = req
            .body(data.to_vec())
            .send()
            .await
            .context("Upload failed")?;

        if resp.status() != reqwest::StatusCode::OK {
            anyhow::bail!("Upload failed with status: {}", resp.status());
        }

        Ok(())
    }

    async fn mark_uploaded(&self, delivery_id: &str) -> Result<()> {
        let resp = self
            .make_ds_request(
                "PATCH",
                &format!("buildDeliveryFiles/{}", delivery_id),
                Some(json!({
                    "attributes": {
                        "uploaded": true
                    },
                    "id": delivery_id,
                    "type": "buildDeliveryFiles"
                })),
            )
            .await?;

        if resp.status() != 200 {
            anyhow::bail!("Failed to mark upload completed!");
        }

        Ok(())
    }
}