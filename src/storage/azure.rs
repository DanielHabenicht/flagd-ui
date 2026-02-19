use super::StorageBackend;
use crate::error::{AppError, AppResult};
use async_trait::async_trait;
use azure_core::credentials::TokenCredential;
use azure_core::http::RequestContent;
use azure_storage_blob::clients::BlobContainerClient;
use azure_storage_blob::BlobServiceClient;
use std::collections::HashMap;
use std::sync::Arc;

fn internal_error(message: impl Into<String>) -> AppError {
    AppError::InternalServerError(message.into())
}

fn not_found_error(message: impl Into<String>) -> AppError {
    AppError::NotFound(message.into())
}

fn sanitize_service_url_for_logs(service_url: &str) -> String {
    service_url
        .split('?')
        .next()
        .unwrap_or(service_url)
        .to_string()
}

/// Azure Blob Storage backend
pub struct AzureStorage {
    container_client: Arc<BlobContainerClient>,
    configured_blob_name: String,
}

#[derive(Default)]
struct ServiceUrlOptions {
    account_name: String,
    storage_domain: String,
    protocol: String,
    is_local_emulator: bool,
    sas_token: String,
}

impl AzureStorage {
    /// Create a new Azure Blob Storage backend from a URI
    ///
    /// Supported format:
    /// - azblob://my-container/myblob.json
    pub fn new(uri: &str) -> AppResult<Self> {
        let (container_name, configured_blob_name) = Self::parse_uri(uri)?;
        let blob_service = Self::create_blob_service_client()?;
        let container_client = blob_service.blob_container_client(&container_name);

        Ok(Self {
            container_client: Arc::new(container_client),
            configured_blob_name,
        })
    }

    /// Parse URI format
    ///
    /// Supported format:
    /// - azblob://my-container/myblob.json
    fn parse_uri(uri: &str) -> AppResult<(String, String)> {
        // Remove azblob:// prefix
        let path = uri
            .strip_prefix("azblob://")
            .ok_or_else(|| internal_error("URI must start with azblob://".to_string()))?;

        let parts: Vec<&str> = path.split('/').collect();
        if parts.len() != 2 || parts[0].is_empty() || parts[1].is_empty() {
            return Err(internal_error(
                "Invalid Azure Blob URI format. Expected: azblob://my-container/myblob.json"
                    .to_string(),
            ));
        }

        let container_name = parts[0];
        let starts_valid = container_name
            .chars()
            .next()
            .map(|ch| ch.is_ascii_lowercase() || ch.is_ascii_digit())
            .unwrap_or(false);
        let chars_valid = container_name
            .chars()
            .all(|ch| ch.is_ascii_lowercase() || ch.is_ascii_digit() || ch == '-');
        let has_consecutive_hyphens = container_name.contains("--");

        if !starts_valid || !chars_valid || has_consecutive_hyphens {
            return Err(internal_error(
                "The container name must start with a letter or number, use only lowercase letters, numbers, and hyphens, and avoid consecutive hyphens."
                    .to_string(),
            ));
        }

        Ok((parts[0].to_string(), parts[1].to_string()))
    }

    fn parse_connection_string(connection_string: &str) -> HashMap<String, String> {
        connection_string
            .split(';')
            .filter_map(|part| {
                let mut key_val = part.splitn(2, '=');
                let key = key_val.next()?.trim();
                let value = key_val.next()?.trim();

                if key.is_empty() {
                    return None;
                }

                Some((key.to_string(), value.to_string()))
            })
            .collect()
    }

    fn is_true_env(name: &str) -> bool {
        std::env::var(name)
            .ok()
            .map(|value| {
                matches!(
                    value.to_ascii_lowercase().as_str(),
                    "1" | "true" | "yes" | "on"
                )
            })
            .unwrap_or(false)
    }

    fn connection_string_from_env() -> Option<String> {
        std::env::var("AZURE_STORAGE_CONNECTION_STRING")
            .ok()
            .filter(|value| !value.trim().is_empty())
            .or_else(|| {
                std::env::var("AZURE_STORAGEBLOB_CONNECTIONSTRING")
                    .ok()
                    .filter(|value| !value.trim().is_empty())
            })
    }

    fn resolve_service_url_and_credential() -> AppResult<(String, Option<Arc<dyn TokenCredential>>)>
    {
        let connection_string = Self::connection_string_from_env();
        let mut connection_string_values = HashMap::new();
        if let Some(value) = &connection_string {
            connection_string_values = Self::parse_connection_string(value);
        }

        let mut service_opts = ServiceUrlOptions {
            account_name: std::env::var("AZURE_STORAGE_ACCOUNT").unwrap_or_default(),
            storage_domain: std::env::var("AZURE_STORAGE_DOMAIN").unwrap_or_default(),
            protocol: std::env::var("AZURE_STORAGE_PROTOCOL").unwrap_or_default(),
            is_local_emulator: Self::is_true_env("AZURE_STORAGE_IS_LOCAL_EMULATOR"),
            sas_token: std::env::var("AZURE_STORAGE_SAS_TOKEN").unwrap_or_default(),
        };

        if service_opts.account_name.is_empty() {
            if let Some(account_name) = connection_string_values.get("AccountName") {
                service_opts.account_name = account_name.clone();
            }
        }

        if service_opts.protocol.is_empty() {
            if let Some(protocol) = connection_string_values.get("DefaultEndpointsProtocol") {
                service_opts.protocol = protocol.clone();
            }
        }

        if service_opts.storage_domain.is_empty() {
            if let Some(suffix) = connection_string_values.get("EndpointSuffix") {
                service_opts.storage_domain = format!("blob.{}", suffix);
            }
        }

        if service_opts.sas_token.is_empty() {
            if let Some(sas) = connection_string_values.get("SharedAccessSignature") {
                service_opts.sas_token = sas.clone();
            }
        }

        let explicit_blob_endpoint = connection_string_values.get("BlobEndpoint").cloned();

        if std::env::var("AZURE_STORAGE_KEY").is_ok() {
            return Err(internal_error(
                "AZURE_STORAGE_KEY shared-key auth is not supported by the current Rust Azure Blob SDK integration. Use AZURE_STORAGE_SAS_TOKEN, a connection string with SharedAccessSignature, or Entra ID credentials."
                    .to_string(),
            ));
        }

        if connection_string_values.contains_key("AccountKey") && service_opts.sas_token.is_empty()
        {
            return Err(internal_error(
                "Connection strings using AccountKey are not supported by the current Rust Azure Blob SDK integration. Use SharedAccessSignature in the connection string, AZURE_STORAGE_SAS_TOKEN, or Entra ID credentials."
                    .to_string(),
            ));
        }

        let protocol = if service_opts.protocol.is_empty() {
            "https".to_string()
        } else {
            let value = service_opts.protocol.to_ascii_lowercase();
            if value != "http" && value != "https" {
                return Err(internal_error(format!(
                    "Invalid AZURE_STORAGE_PROTOCOL '{}'. Expected 'http' or 'https'.",
                    service_opts.protocol
                )));
            }
            value
        };

        let storage_domain = if service_opts.storage_domain.is_empty() {
            "blob.core.windows.net".to_string()
        } else {
            service_opts.storage_domain.clone()
        };

        if service_opts.account_name.is_empty() {
            return Err(internal_error(
                "AZURE_STORAGE_ACCOUNT is required to construct the Azure Blob service URL."
                    .to_string(),
            ));
        }

        let service_url = if let Some(blob_endpoint) = explicit_blob_endpoint {
            blob_endpoint.trim_end_matches('/').to_string()
        } else if service_opts.is_local_emulator {
            format!(
                "{}://{}/{}",
                protocol, storage_domain, service_opts.account_name
            )
        } else {
            format!(
                "{}://{}.{}",
                protocol, service_opts.account_name, storage_domain
            )
        };

        if service_opts.is_local_emulator {
            tracing::info!(
                credential_mode = "local_azurite_token",
                service_url = %sanitize_service_url_for_logs(&service_url),
                "Azure Blob auth mode selected"
            );
            #[cfg(feature = "azurite-local-auth")]
            return Ok((
                service_url,
                Some(super::azurite_auth::build_azurite_token_credential()?),
            ));
            #[cfg(not(feature = "azurite-local-auth"))]
            return Err(internal_error(
                "Azurite local auth feature is not enabled.".to_string(),
            ));
        }

        tracing::info!(
            credential_mode = "default_azure_identity",
            service_url = %sanitize_service_url_for_logs(&service_url),
            "Azure Blob auth mode selected"
        );
        Ok((service_url, None))
    }

    fn create_blob_service_client() -> AppResult<BlobServiceClient> {
        let (service_url, credential) = Self::resolve_service_url_and_credential()?;

        let blob_service = BlobServiceClient::new(&service_url, credential, None).map_err(|e| {
            internal_error(format!(
                "Failed to create blob service client: {}. \
                     Configure via AZURE_STORAGE_ACCOUNT (plus optional AZURE_STORAGE_DOMAIN/AZURE_STORAGE_PROTOCOL), \
                     AZURE_STORAGE_CONNECTION_STRING/AZURE_STORAGEBLOB_CONNECTIONSTRING, or AZURE_STORAGE_SAS_TOKEN.",
                e
            ))
        })?;

        Ok(blob_service)
    }

    /// Validate blob name to prevent path traversal
    fn validate_blob_name(&self, name: &str) -> AppResult<String> {
        if name != self.configured_blob_name {
            return Err(not_found_error(format!(
                "Flag definition '{}' not found",
                name
            )));
        }

        Ok(self.configured_blob_name.clone())
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
        let blob_client = self
            .container_client
            .blob_client(&self.configured_blob_name);

        match blob_client.exists().await {
            Ok(true) => Ok(vec![self.configured_blob_name.clone()]),
            Ok(false) => Ok(vec![]),
            Err(e) => {
                if Self::is_not_found_error(&e) {
                    tracing::warn!("Container or blob not found, returning empty list");
                    Ok(vec![])
                } else {
                    Err(internal_error(format!("Failed to list blobs: {}", e)))
                }
            }
        }
    }

    async fn read_flag(&self, name: &str) -> AppResult<serde_json::Value> {
        let blob_name = self.validate_blob_name(name)?;
        let blob_client = self.container_client.blob_client(&blob_name);

        // Download the blob
        let response = blob_client.download(None).await.map_err(|e| {
            if Self::is_not_found_error(&e) {
                not_found_error(format!("Flag definition '{}' not found", name))
            } else {
                internal_error(format!("Failed to read blob: {}", e))
            }
        })?;

        let (_, _, body) = response.deconstruct();
        let bytes = body
            .collect()
            .await
            .map_err(|e| internal_error(format!("Failed to read blob content: {}", e)))?;

        serde_json::from_slice(&bytes)
            .map_err(|e| internal_error(format!("Failed to parse JSON: {}", e)))
    }

    async fn write_flag(&self, name: &str, content: &serde_json::Value) -> AppResult<()> {
        let blob_name = self.validate_blob_name(name)?;
        let blob_client = self.container_client.blob_client(&blob_name);

        let json_bytes = serde_json::to_vec_pretty(content)
            .map_err(|e| internal_error(format!("Failed to serialize JSON: {}", e)))?;

        let content_length = json_bytes.len() as u64;
        let request_content = RequestContent::from(json_bytes);

        // Upload the blob
        blob_client
            .upload(request_content, true, content_length, None)
            .await
            .map_err(|e| internal_error(format!("Failed to write blob: {}", e)))?;

        Ok(())
    }

    async fn delete_flag(&self, name: &str) -> AppResult<()> {
        let blob_name = self.validate_blob_name(name)?;
        let blob_client = self.container_client.blob_client(&blob_name);

        blob_client.delete(None).await.map_err(|e| {
            if Self::is_not_found_error(&e) {
                not_found_error(format!("Flag definition '{}' not found", name))
            } else {
                internal_error(format!("Failed to delete blob: {}", e))
            }
        })?;

        Ok(())
    }

    async fn flag_exists(&self, name: &str) -> AppResult<bool> {
        let blob_name = self.validate_blob_name(name)?;
        let blob_client = self.container_client.blob_client(&blob_name);

        match blob_client.exists().await {
            Ok(exists) => Ok(exists),
            Err(e) => Err(internal_error(format!(
                "Failed to check if blob exists: {}",
                e
            ))),
        }
    }
}
