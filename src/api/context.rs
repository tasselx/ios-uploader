use std::fs::File;

#[derive(Debug)]
pub struct Context {
    pub username: String,
    pub password: String,
    pub file_path: String,
    pub file: Option<File>,
    pub file_size: usize,
    #[allow(dead_code)]
    pub concurrency: usize,
    #[allow(dead_code)]
    pub status: bool,

    pub bundle_id: String,
    pub bundle_version: String,
    pub bundle_short_version: String,
    pub bundle_name: String,
    pub mobile_provision_path: String,
    pub mobile_provision: Vec<u8>,

    pub session_id: String,
    pub shared_secret: String,
    pub ds_token: String,
    pub ds_token_name: String,

    pub provider_public_id: String,
    pub apple_id: String,
    pub app_name: String,
    pub app_icon_url: String,

    pub file_name: String,
    pub file_checksum: String,
    pub asset_description: Vec<u8>,
    pub asset_desc_size: usize,
    pub asset_desc_checksum: String,

    pub current_build: Option<super::Build>,

    pub asset_desc_delivery_id: String,
    pub asset_desc_ops: Vec<super::UploadOperation>,
    pub asset_delivery_id: String,
    pub asset_ops: Vec<super::UploadOperation>,
}

impl Default for Context {
    fn default() -> Self {
        Self {
            file: None,
            username: String::new(),
            password: String::new(),
            file_path: String::new(),
            file_size: 0,
            concurrency: 4,
            status: false,
            bundle_id: String::new(),
            bundle_version: String::new(),
            bundle_short_version: String::new(),
            bundle_name: String::new(),
            mobile_provision_path: String::new(),
            mobile_provision: Vec::new(),
            session_id: String::new(),
            shared_secret: String::new(),
            ds_token: String::new(),
            ds_token_name: String::new(),
            provider_public_id: String::new(),
            apple_id: String::new(),
            app_name: String::new(),
            app_icon_url: String::new(),
            file_name: String::new(),
            file_checksum: String::new(),
            asset_description: Vec::new(),
            asset_desc_size: 0,
            asset_desc_checksum: String::new(),
            current_build: None,
            asset_desc_delivery_id: String::new(),
            asset_desc_ops: Vec::new(),
            asset_delivery_id: String::new(),
            asset_ops: Vec::new(),
        }
    }
}