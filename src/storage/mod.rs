mod azure;
mod local;

pub use azure::AzureStorage;
pub use local::LocalStorage;

use crate::error::AppResult;
use async_trait::async_trait;
use std::sync::Arc;

/// Trait defining the interface for flag storage backends
#[async_trait]
pub trait StorageBackend: Send + Sync {
    /// List all flag definition files
    /// Returns a vector of flag file names (without .flagd.json extension)
    async fn list_flags(&self) -> AppResult<Vec<String>>;

    /// Read a flag definition file by name
    /// Returns the JSON content of the file
    async fn read_flag(&self, name: &str) -> AppResult<serde_json::Value>;

    /// Write a flag definition file
    /// Creates or updates the file with the given content
    async fn write_flag(&self, name: &str, content: &serde_json::Value) -> AppResult<()>;

    /// Delete a flag definition file
    async fn delete_flag(&self, name: &str) -> AppResult<()>;

    /// Check if a flag definition file exists
    async fn flag_exists(&self, name: &str) -> AppResult<bool>;
}

/// Factory function to create a storage backend based on URI
pub fn create_storage_backend(uri: &str) -> AppResult<Arc<dyn StorageBackend>> {
    if uri.starts_with("azblob://") {
        // Azure Blob Storage URI
        Ok(Arc::new(AzureStorage::new(uri)?))
    } else if uri.starts_with("file://") {
        // Local file system
        let path = uri.trim_start_matches("file://");
        Ok(Arc::new(LocalStorage::new(path)))
    } else {
        // Default to local file system for relative or absolute paths
        Ok(Arc::new(LocalStorage::new(uri)))
    }
}
