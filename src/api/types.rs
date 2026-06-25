#[derive(Debug, Clone)]
pub struct Build {
    pub id: String,
    pub processing_state: String,
}

#[derive(Debug, Clone)]
pub struct UploadOperation {
    pub url: String,
    pub method: String,
    pub offset: usize,
    pub length: usize,
    pub request_headers: Vec<RequestHeader>,
}

#[derive(Debug, Clone)]
pub struct RequestHeader {
    pub name: String,
    pub value: String,
}