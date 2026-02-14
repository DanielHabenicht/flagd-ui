use async_trait::async_trait;
use azure_core::error::ErrorKind;
use azure_storage::StorageCredentials;
use azure_storage_blobs::prelude::*;
use std::sync::Arc;

use crate::error::{AppError, AppResult};
use super::StorageBackend;

/// Azure Blob Storage backend
pub struct AzureStorage {
    container_client: Arc<ContainerClient>,
}

impl AzureStorage {
    /// Create a new Azure Blob Storage backend from a connection string or URL
    pub fn new(uri: &str) -> AppResult<Self> {
        // Parse the URI to extract connection info
        let container_client = Self::parse_uri(uri)?;
        Ok(Self {
            container_client: Arc::new(container_client),
        })
    }

    /// Parse Azure Storage URI and create container client
    fn parse_uri(uri: &str) -> AppResult<ContainerClient> {
        // Expected format: https://<account>.blob.core.windows.net/<container>
        // Or for Azurite: http://127.0.0.1:10000/<account>/<container>
        
        // Check if it's a full blob URL
        if uri.starts_with("http://") || uri.starts_with("https://") {
            // Try to parse as Azure Storage URL
            let parts: Vec<&str> = uri.split('/').collect();
            
            if parts.len() < 4 {
                return Err(AppError::BadRequest(
                    "Invalid Azure Storage URI format. Expected: https://<account>.blob.core.windows.net/<container>".to_string()
                ));
            }

            // Extract account name and container name
            let host = parts[2];
            let container_name = parts[parts.len() - 1];
            
            // Check for Azurite (localhost or 127.0.0.1)
            if host.starts_with("127.0.0.1:") || host.starts_with("localhost:") {
                // Azurite uses well-known credentials
                let account_name = if parts.len() >= 5 {
                    parts[3]
                } else {
                    "devstoreaccount1"
                };
                
                // Use Azurite's default account key
                let account_key = "Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==";
                
                // Set environment variable to use storage emulator
                std::env::set_var("AZURE_STORAGE_USE_EMULATOR", "true");
                
                let storage_credentials = StorageCredentials::access_key(
                    account_name.to_string(),
                    account_key.to_string()
                );
                
                // For Azurite, use BlobServiceClient which will automatically use localhost:10000
                let blob_service = BlobServiceClient::new(account_name, storage_credentials);
                Ok(blob_service.container_client(container_name))
            } else {
                // Extract account name from host (e.g., myaccount.blob.core.windows.net)
                let account_name = host.split('.').next().ok_or_else(|| {
                    AppError::BadRequest("Could not extract account name from URI".to_string())
                })?;

                // Try to get credentials from environment
                let account_key = std::env::var("AZURE_STORAGE_ACCOUNT_KEY")
                    .or_else(|_| std::env::var("AZURE_STORAGE_KEY"))
                    .map_err(|_| {
                        AppError::BadRequest(
                            "Azure Storage account key not found. Set AZURE_STORAGE_ACCOUNT_KEY or AZURE_STORAGE_KEY environment variable".to_string()
                        )
                    })?;

                let storage_credentials = StorageCredentials::access_key(
                    account_name.to_string(),
                    account_key
                );

                let blob_service_client = BlobServiceClient::new(account_name, storage_credentials);
                Ok(blob_service_client.container_client(container_name))
            }
        } else {
            Err(AppError::BadRequest(
                "URI must start with http:// or https://".to_string()
            ))
        }
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
}

#[async_trait]
impl StorageBackend for AzureStorage {
    async fn list_flags(&self) -> AppResult<Vec<String>> {
        let mut files = Vec::new();
        
        // List all blobs in the container
        let mut stream = self.container_client
            .list_blobs()
            .into_stream();

        use futures::StreamExt;
        
        while let Some(result) = stream.next().await {
            match result {
                Ok(response) => {
                    for blob in response.blobs.blobs() {
                        let blob_name = &blob.name;
                        if blob_name.ends_with(".flagd.json") {
                            let name = blob_name.trim_end_matches(".flagd.json").to_string();
                            files.push(name);
                        }
                    }
                }
                Err(e) => {
                    // If container doesn't exist (404), return empty list
                    if matches!(e.kind(), ErrorKind::HttpResponse { status, .. } if *status == 404) {
                        tracing::warn!("Container not found, returning empty list");
                        return Ok(vec![]);
                    }
                    return Err(AppError::InternalServerError(format!("Failed to list blobs: {}", e)));
                }
            }
        }

        files.sort();
        Ok(files)
    }

    async fn read_flag(&self, name: &str) -> AppResult<serde_json::Value> {
        let blob_name = self.validate_blob_name(name)?;
        let blob_client = self.container_client.blob_client(&blob_name);

        let data = blob_client
            .get_content()
            .await
            .map_err(|e| {
                if matches!(e.kind(), ErrorKind::HttpResponse { status, .. } if *status == 404) {
                    AppError::NotFound(format!("Flag definition '{}' not found", name))
                } else {
                    AppError::InternalServerError(format!("Failed to read blob: {}", e))
                }
            })?;

        serde_json::from_slice(&data)
            .map_err(|e| AppError::InternalServerError(format!("Failed to parse JSON: {}", e)))
    }

    async fn write_flag(&self, name: &str, content: &serde_json::Value) -> AppResult<()> {
        let blob_name = self.validate_blob_name(name)?;
        let blob_client = self.container_client.blob_client(&blob_name);

        let json_string = serde_json::to_string_pretty(content)
            .map_err(|e| AppError::InternalServerError(format!("Failed to serialize JSON: {}", e)))?;

        blob_client
            .put_block_blob(json_string)
            .content_type("application/json")
            .await
            .map_err(|e| {
                AppError::InternalServerError(format!("Failed to write blob: {}", e))
            })?;

        Ok(())
    }

    async fn delete_flag(&self, name: &str) -> AppResult<()> {
        let blob_name = self.validate_blob_name(name)?;
        let blob_client = self.container_client.blob_client(&blob_name);

        blob_client
            .delete()
            .await
            .map_err(|e| {
                if matches!(e.kind(), ErrorKind::HttpResponse { status, .. } if *status == 404) {
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

        match blob_client.get_properties().await {
            Ok(_) => Ok(true),
            Err(e) => {
                if matches!(e.kind(), ErrorKind::HttpResponse { status, .. } if *status == 404) {
                    Ok(false)
                } else {
                    Err(AppError::InternalServerError(format!("Failed to check blob existence: {}", e)))
                }
            }
        }
    }
}
