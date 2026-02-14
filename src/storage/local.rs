use async_trait::async_trait;
use std::path::PathBuf;
use std::fs;

use crate::error::{AppError, AppResult};
use super::StorageBackend;

/// Local file system storage backend
pub struct LocalStorage {
    base_path: PathBuf,
}

impl LocalStorage {
    /// Create a new local storage backend
    pub fn new(path: &str) -> Self {
        Self {
            base_path: PathBuf::from(path),
        }
    }

    /// Get the file path for a flag definition
    fn get_file_path(&self, name: &str) -> AppResult<PathBuf> {
        // Validate filename to prevent path traversal attacks
        if name.contains("..") || name.contains('/') || name.contains('\\') {
            return Err(AppError::BadRequest(
                "Invalid filename: cannot contain path separators or '..'".to_string(),
            ));
        }

        if name.is_empty() {
            return Err(AppError::BadRequest("Filename cannot be empty".to_string()));
        }

        Ok(self.base_path.join(format!("{}.flagd.json", name)))
    }
}

#[async_trait]
impl StorageBackend for LocalStorage {
    async fn list_flags(&self) -> AppResult<Vec<String>> {
        // Create directory if it doesn't exist
        if !self.base_path.exists() {
            fs::create_dir_all(&self.base_path).map_err(|e| {
                AppError::InternalServerError(format!("Failed to create flags directory: {}", e))
            })?;
        }

        let entries = fs::read_dir(&self.base_path).map_err(|e| {
            AppError::InternalServerError(format!("Failed to read flags directory: {}", e))
        })?;

        let mut files = Vec::new();
        for entry in entries {
            let entry = entry.map_err(|e| {
                AppError::InternalServerError(format!("Failed to read directory entry: {}", e))
            })?;
            let path = entry.path();

            if path.is_file() {
                if let Some(filename) = path.file_name() {
                    if let Some(name_str) = filename.to_str() {
                        if name_str.ends_with(".flagd.json") {
                            let name = name_str.trim_end_matches(".flagd.json").to_string();
                            files.push(name);
                        }
                    }
                }
            }
        }

        files.sort();
        Ok(files)
    }

    async fn read_flag(&self, name: &str) -> AppResult<serde_json::Value> {
        let file_path = self.get_file_path(name)?;

        if !file_path.exists() {
            return Err(AppError::NotFound(format!(
                "Flag definition '{}' not found",
                name
            )));
        }

        let content = fs::read_to_string(&file_path)
            .map_err(|e| AppError::InternalServerError(format!("Failed to read file: {}", e)))?;

        serde_json::from_str(&content)
            .map_err(|e| AppError::InternalServerError(format!("Failed to parse JSON: {}", e)))
    }

    async fn write_flag(&self, name: &str, content: &serde_json::Value) -> AppResult<()> {
        let file_path = self.get_file_path(name)?;

        // Create the directory if it doesn't exist
        if let Some(parent) = file_path.parent() {
            fs::create_dir_all(parent).map_err(|e| {
                AppError::InternalServerError(format!("Failed to create directory: {}", e))
            })?;
        }

        let json_string = serde_json::to_string_pretty(content)
            .map_err(|e| AppError::InternalServerError(format!("Failed to serialize JSON: {}", e)))?;

        fs::write(&file_path, json_string)
            .map_err(|e| AppError::InternalServerError(format!("Failed to write file: {}", e)))
    }

    async fn delete_flag(&self, name: &str) -> AppResult<()> {
        let file_path = self.get_file_path(name)?;

        if !file_path.exists() {
            return Err(AppError::NotFound(format!(
                "Flag definition '{}' not found",
                name
            )));
        }

        fs::remove_file(&file_path)
            .map_err(|e| AppError::InternalServerError(format!("Failed to delete file: {}", e)))
    }

    async fn flag_exists(&self, name: &str) -> AppResult<bool> {
        let file_path = self.get_file_path(name)?;
        Ok(file_path.exists())
    }
}
