use super::StorageBackend;
use crate::error::{AppError, AppResult};
use async_trait::async_trait;
use azure_core::{
    http::{ClientOptions, InstrumentationOptions, RequestContent},
    tracing::TracerProvider,
};
use azure_identity::DefaultAzureCredential;
use azure_storage_blob::clients::BlobContainerClient;
use azure_storage_blob::BlobServiceClient;
use futures::StreamExt;
use std::sync::Arc;

/// Azure Blob Storage backend
pub struct AzureStorage {
    container_client: Arc<BlobContainerClient>,
}

impl AzureStorage {
    /// Create a new Azure Blob Storage backend from a URI
    ///
    /// Expected formats:
    /// - azblob://container (uses default Azure storage)
    /// - azblob://account.blob.core.windows.net/container
    /// - azblob://127.0.0.1:10000/devstoreaccount1/container (for Azurite)
    pub fn new(uri: &str) -> AppResult<Self> {
        let container_client = Self::parse_uri(uri)?;
        Ok(Self {
            container_client: Arc::new(container_client),
        })
    }

    /// Parse URI format
    ///
    /// Expected formats:
    /// - azblob://container
    /// - azblob://account.blob.core.windows.net/container
    /// - azblob://127.0.0.1:10000/devstoreaccount1/container
    fn parse_uri(uri: &str) -> AppResult<BlobContainerClient> {
        // Remove azblob:// prefix
        let path = uri
            .strip_prefix("azblob://")
            .ok_or_else(|| AppError::BadRequest("URI must start with azblob://".to_string()))?;

        // Parse the URI to extract host, account, and container
        let parts: Vec<&str> = path.split('/').collect();

        let (service_url, container_name) = if parts.len() == 1 {
            // Format: azblob://container (default Azure)
            // We need account name from environment or default
            let account = std::env::var("AZURE_STORAGE_ACCOUNT")
                .map_err(|_| AppError::BadRequest(
                    "For azblob://container format, AZURE_STORAGE_ACCOUNT environment variable must be set".to_string()
                ))?;
            let url = format!("https://{}.blob.core.windows.net", account);
            (url, parts[0].to_string())
        } else if parts.len() == 2 {
            // Format: azblob://host/container OR azblob://account.blob.core.windows.net/container
            let host = parts[0];
            let container = parts[1];

            if host.contains(".") {
                // Looks like a FQDN (e.g., account.blob.core.windows.net)
                let url = format!("https://{}", host);
                (url, container.to_string())
            } else if host.contains(":") {
                // Looks like host:port (e.g., 127.0.0.1:10000)
                let url = format!("http://{}", host);
                (url, container.to_string())
            } else {
                // Account name only
                let url = format!("https://{}.blob.core.windows.net", host);
                (url, container.to_string())
            }
        } else if parts.len() == 3 {
            // Format: azblob://127.0.0.1:10000/devstoreaccount1/container
            let host = parts[0];
            let account = parts[1];
            let container = parts[2];
            let url = if host.starts_with("127.0.0.1") || host.starts_with("localhost") {
                format!("http://{}/{}", host, account)
            } else {
                format!("https://{}/{}", host, account)
            };
            (url, container.to_string())
        } else {
            return Err(AppError::BadRequest(
                "Invalid URI format. Expected: azblob://container, azblob://host/container, or azblob://host:port/account/container".to_string()
            ));
        };

        // Create credential using DefaultAzureCredential
        let credential = Arc::new(DefaultAzureCredential::default());
        // Create blob service client
        let blob_service =
            BlobServiceClient::new(&service_url, Some(credential), None).map_err(|e| {
                AppError::BadRequest(format!("Failed to create blob service client: {}", e))
            })?;

        Ok(blob_service.blob_container_client(&container_name))
    }

    /// Validate blob name to prevent path traversal
    fn validate_blob_name(&self, name: &str) -> AppResult<String> {
        if name.contains("..") || name.is_empty() {
            return Err(AppError::BadRequest(
                "Invalid blob name: cannot contain '..' or be empty".to_string(),
            ));
        }
        Ok(format!("{}.flagd.json", name))
    }

    /// Helper to check if an error is a 404
    fn is_not_found_error(e: &dyn std::error::Error) -> bool {
        // Check if error message contains "404" or "NotFound"
        let err_str = format!("{:?}", e);
        err_str.contains("404") || err_str.contains("NotFound") || err_str.contains("BlobNotFound")
    }
}

#[async_trait]
impl StorageBackend for AzureStorage {
    async fn list_flags(&self) -> AppResult<Vec<String>> {
        let mut files = Vec::new();

        // List all blobs in the container
        let mut pager = self.container_client.list_blobs(None).map_err(|e| {
            AppError::InternalServerError(format!("Failed to create list blobs pager: {}", e))
        })?;

        while let Some(result) = pager.next().await {
            match result {
                Ok(page) => {
                    if let Some(name) = page.name {
                        let name_str = name.to_string();
                        if name_str.ends_with(".flagd.json") {
                            let flag_name = name_str.trim_end_matches(".flagd.json").to_string();
                            files.push(flag_name);
                        }
                    }
                }
                Err(e) => {
                    // If container doesn't exist (404), return empty list
                    if Self::is_not_found_error(&e) {
                        tracing::warn!("Container not found, returning empty list");
                        return Ok(vec![]);
                    }
                    return Err(AppError::InternalServerError(format!(
                        "Failed to list blobs: {}",
                        e
                    )));
                }
            }
        }

        files.sort();
        Ok(files)
    }

    async fn read_flag(&self, name: &str) -> AppResult<serde_json::Value> {
        let blob_name = self.validate_blob_name(name)?;
        let blob_client = self.container_client.blob_client(&blob_name);

        // Download the blob
        let response = blob_client.download(None).await.map_err(|e| {
            if Self::is_not_found_error(&e) {
                AppError::NotFound(format!("Flag definition '{}' not found", name))
            } else {
                AppError::InternalServerError(format!("Failed to read blob: {}", e))
            }
        })?;

        let (_, _, body) = response.deconstruct();
        let bytes = body.collect().await.map_err(|e| {
            AppError::InternalServerError(format!("Failed to read blob content: {}", e))
        })?;

        serde_json::from_slice(&bytes)
            .map_err(|e| AppError::InternalServerError(format!("Failed to parse JSON: {}", e)))
    }

    async fn write_flag(&self, name: &str, content: &serde_json::Value) -> AppResult<()> {
        let blob_name = self.validate_blob_name(name)?;
        let blob_client = self.container_client.blob_client(&blob_name);

        let json_bytes = serde_json::to_vec_pretty(content).map_err(|e| {
            AppError::InternalServerError(format!("Failed to serialize JSON: {}", e))
        })?;

        let content_length = json_bytes.len() as u64;
        let request_content = RequestContent::from(json_bytes);

        // Upload the blob
        blob_client
            .upload(request_content, true, content_length, None)
            .await
            .map_err(|e| AppError::InternalServerError(format!("Failed to write blob: {}", e)))?;

        Ok(())
    }

    async fn delete_flag(&self, name: &str) -> AppResult<()> {
        let blob_name = self.validate_blob_name(name)?;
        let blob_client = self.container_client.blob_client(&blob_name);

        blob_client.delete(None).await.map_err(|e| {
            if Self::is_not_found_error(&e) {
                AppError::NotFound(format!("Flag definition '{}' not found", name))
            } else {
                AppError::InternalServerError(format!("Failed to delete blob: {}", e))
            }
        })?;

        Ok(())
    }

    async fn flag_exists(&self, name: &str) -> AppResult<bool> {
        let blob_name = self.validate_blob_name(name)?;
        let blob_client = self.container_client.blob_client(&blob_name);

        match blob_client.exists().await {
            Ok(exists) => Ok(exists),
            Err(e) => Err(AppError::InternalServerError(format!(
                "Failed to check if blob exists: {}",
                e
            ))),
        }
    }
}
