use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use serde::{Deserialize, Serialize};
use std::{fs, path::PathBuf, sync::Arc};
use utoipa::ToSchema;

use crate::{
    config::ServerConfig,
    error::{AppError, AppResult},
};

struct LocalSchemaRetriever {
    base_dir: PathBuf,
}

impl jsonschema::Retrieve for LocalSchemaRetriever {
    fn retrieve(
        &self,
        uri: &jsonschema::Uri<&str>,
    ) -> Result<serde_json::Value, Box<dyn std::error::Error + Send + Sync>> {
        let uri_str = uri.as_str();

        let candidate = if uri_str.starts_with("json-schema:///") {
            let rel = uri_str.trim_start_matches("json-schema:///");
            self.base_dir.join(rel)
        } else if uri.scheme().as_str() == "file" {
            PathBuf::from(uri.path().as_str())
        } else if uri.scheme().as_str() == "https"
            && uri.path().as_str().ends_with("targeting.json")
        {
            self.base_dir.join("targeting.json")
        } else {
            return Err(format!("Unsupported schema URI: {uri_str}").into());
        };

        let content = fs::read_to_string(&candidate)?;
        Ok(serde_json::from_str(&content)?)
    }
}

/// Application state containing configuration
#[derive(Clone)]
pub struct AppState {
    pub config: Arc<ServerConfig>,
    pub schema: Arc<jsonschema::Validator>,
}

/// Request payload for creating a new flag definition file
#[derive(Debug, Deserialize, ToSchema)]
pub struct CreateFlagRequest {
    /// Name of the flag definition file (without .flagd.json extension)
    #[schema(example = "my-flags")]
    pub name: String,
    /// Flag definitions (without $schema property)
    #[schema(value_type = Object)]
    pub flags: serde_json::Value,
    /// Optional metadata for the full flag set
    #[schema(value_type = Object)]
    pub metadata: Option<serde_json::Map<String, serde_json::Value>>,
}

/// Request payload for updating a flag definition file
#[derive(Debug, Deserialize, ToSchema)]
pub struct UpdateFlagRequest {
    /// Flag definitions (without $schema property)
    #[schema(value_type = Object)]
    pub flags: serde_json::Value,
    /// Optional metadata for the full flag set
    #[schema(value_type = Object)]
    pub metadata: Option<serde_json::Map<String, serde_json::Value>>,
}

/// Response for a single flag definition file
#[derive(Debug, Serialize, ToSchema)]
pub struct FlagDefinitionResponse {
    /// Name of the flag definition file
    #[schema(example = "my-flags")]
    pub name: String,
    /// Complete flag definition content including $schema
    #[schema(value_type = Object)]
    pub content: serde_json::Value,
}

/// Response for listing all flag definition files
#[derive(Debug, Serialize, ToSchema)]
pub struct ListFlagsResponse {
    /// List of flag definition file names
    #[schema(example = json!(["demo", "production"]))]
    pub files: Vec<String>,
}

/// Initialize the application state with schema validation
pub async fn init_app_state(config: ServerConfig) -> AppResult<AppState> {
    let schema_dir = PathBuf::from(&config.schema_file_path)
        .parent()
        .map(|p| p.to_path_buf())
        .unwrap_or_else(|| PathBuf::from("."));

    // Load the schema from the local file
    let schema_content = fs::read_to_string(&config.schema_file_path)
        .map_err(|e| AppError::InternalServerError(format!("Failed to read schema file: {}", e)))?;

    let schema_json: serde_json::Value = serde_json::from_str(&schema_content)
        .map_err(|e| AppError::InternalServerError(format!("Failed to parse schema: {}", e)))?;

    // Compile the JSON schema into a validator
    let schema = jsonschema::options()
        .with_retriever(LocalSchemaRetriever {
            base_dir: schema_dir,
        })
        .build(&schema_json)
        .map_err(|e| AppError::InternalServerError(format!("Invalid schema: {}", e)))?;

    Ok(AppState {
        config: Arc::new(config),
        schema: Arc::new(schema),
    })
}

/// Validate flag definition against the schema
fn validate_flags(
    schema: &jsonschema::Validator,
    complete_doc: &serde_json::Value,
) -> AppResult<()> {
    schema
        .validate(complete_doc)
        .map_err(|error| AppError::BadRequest(format!("Schema validation failed: {}", error)))
}

/// Build the file path for a flag definition file
fn get_flag_file_path(flags_dir: &str, name: &str) -> AppResult<PathBuf> {
    // Validate filename to prevent path traversal attacks
    if name.contains("..") || name.contains('/') || name.contains('\\') {
        return Err(AppError::BadRequest(
            "Invalid filename: cannot contain path separators or '..'".to_string(),
        ));
    }

    if name.is_empty() {
        return Err(AppError::BadRequest("Filename cannot be empty".to_string()));
    }

    Ok(PathBuf::from(flags_dir).join(format!("{}.flagd.json", name)))
}

/// List all flag definition files
#[utoipa::path(
    get,
    path = "/api/flags",
    responses(
        (status = 200, description = "List of all flag definition files", body = ListFlagsResponse),
        (status = 500, description = "Internal server error")
    ),
    tag = "flags"
)]
pub async fn list_flags(State(state): State<AppState>) -> AppResult<impl IntoResponse> {
    let flags_dir = PathBuf::from(&state.config.flags_dir);

    // Create directory if it doesn't exist
    if !flags_dir.exists() {
        fs::create_dir_all(&flags_dir).map_err(|e| {
            AppError::InternalServerError(format!("Failed to create flags directory: {}", e))
        })?;
    }

    let entries = fs::read_dir(&flags_dir).map_err(|e| {
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
                        // Remove the .flagd.json extension
                        let name = name_str.trim_end_matches(".flagd.json").to_string();
                        files.push(name);
                    }
                }
            }
        }
    }

    files.sort();

    Ok(Json(ListFlagsResponse { files }))
}

/// Get a specific flag definition file
#[utoipa::path(
    get,
    path = "/api/flags/{name}",
    params(
        ("name" = String, Path, description = "Name of the flag definition file")
    ),
    responses(
        (status = 200, description = "Flag definition file content", body = Object),
        (status = 404, description = "Flag definition not found"),
        (status = 400, description = "Invalid filename"),
        (status = 500, description = "Internal server error")
    ),
    tag = "flags"
)]
pub async fn get_flag(
    State(state): State<AppState>,
    Path(name): Path<String>,
) -> AppResult<impl IntoResponse> {
    let file_path = get_flag_file_path(&state.config.flags_dir, &name)?;

    if !file_path.exists() {
        return Err(AppError::NotFound(format!(
            "Flag definition '{}' not found",
            name
        )));
    }

    let content = fs::read_to_string(&file_path)
        .map_err(|e| AppError::InternalServerError(format!("Failed to read file: {}", e)))?;

    let json: serde_json::Value = serde_json::from_str(&content)
        .map_err(|e| AppError::InternalServerError(format!("Failed to parse JSON: {}", e)))?;

    Ok(Json(json))
}

/// Create a new flag definition file
#[utoipa::path(
    post,
    path = "/api/flags",
    request_body = CreateFlagRequest,
    responses(
        (status = 201, description = "Flag definition file created successfully", body = FlagDefinitionResponse),
        (status = 400, description = "Invalid request or validation failed"),
        (status = 500, description = "Internal server error")
    ),
    tag = "flags"
)]
pub async fn create_flag(
    State(state): State<AppState>,
    Json(payload): Json<CreateFlagRequest>,
) -> AppResult<impl IntoResponse> {
    let file_path = get_flag_file_path(&state.config.flags_dir, &payload.name)?;

    // Check if file already exists
    if file_path.exists() {
        return Err(AppError::BadRequest(format!(
            "Flag definition '{}' already exists",
            payload.name
        )));
    }

    let mut complete_doc = serde_json::json!({
        "$schema": "https://flagd.dev/schema/v0/flags.json",
        "flags": payload.flags
    });

    if let Some(metadata) = payload.metadata {
        complete_doc["metadata"] = serde_json::Value::Object(metadata);
    }

    // Validate the full document against the schema
    validate_flags(&state.schema, &complete_doc)?;

    // Create the directory if it doesn't exist
    if let Some(parent) = file_path.parent() {
        fs::create_dir_all(parent).map_err(|e| {
            AppError::InternalServerError(format!("Failed to create directory: {}", e))
        })?;
    }

    // Write the file
    let json_string = serde_json::to_string_pretty(&complete_doc)
        .map_err(|e| AppError::InternalServerError(format!("Failed to serialize JSON: {}", e)))?;

    fs::write(&file_path, json_string)
        .map_err(|e| AppError::InternalServerError(format!("Failed to write file: {}", e)))?;

    Ok((
        StatusCode::CREATED,
        Json(FlagDefinitionResponse {
            name: payload.name,
            content: complete_doc,
        }),
    ))
}

/// Update an existing flag definition file
#[utoipa::path(
    put,
    path = "/api/flags/{name}",
    params(
        ("name" = String, Path, description = "Name of the flag definition file to update")
    ),
    request_body = UpdateFlagRequest,
    responses(
        (status = 200, description = "Flag definition file updated successfully", body = FlagDefinitionResponse),
        (status = 404, description = "Flag definition not found"),
        (status = 400, description = "Invalid request or validation failed"),
        (status = 500, description = "Internal server error")
    ),
    tag = "flags"
)]
pub async fn update_flag(
    State(state): State<AppState>,
    Path(name): Path<String>,
    Json(payload): Json<UpdateFlagRequest>,
) -> AppResult<impl IntoResponse> {
    let file_path = get_flag_file_path(&state.config.flags_dir, &name)?;

    // Check if file exists
    if !file_path.exists() {
        return Err(AppError::NotFound(format!(
            "Flag definition '{}' not found",
            name
        )));
    }

    // Preserve existing metadata if the client does not send it.
    let existing_content = fs::read_to_string(&file_path)
        .map_err(|e| AppError::InternalServerError(format!("Failed to read file: {}", e)))?;

    let existing_json: serde_json::Value = serde_json::from_str(&existing_content)
        .map_err(|e| AppError::InternalServerError(format!("Failed to parse JSON: {}", e)))?;

    let existing_metadata = existing_json
        .get("metadata")
        .and_then(|value| value.as_object())
        .cloned();

    let metadata_to_write = payload.metadata.or(existing_metadata);

    let mut complete_doc = serde_json::json!({
        "$schema": "https://flagd.dev/schema/v0/flags.json",
        "flags": payload.flags
    });

    if let Some(metadata) = metadata_to_write {
        complete_doc["metadata"] = serde_json::Value::Object(metadata);
    }

    // Validate the full document against the schema
    validate_flags(&state.schema, &complete_doc)?;

    // Write the file
    let json_string = serde_json::to_string_pretty(&complete_doc)
        .map_err(|e| AppError::InternalServerError(format!("Failed to serialize JSON: {}", e)))?;

    fs::write(&file_path, json_string)
        .map_err(|e| AppError::InternalServerError(format!("Failed to write file: {}", e)))?;

    Ok(Json(FlagDefinitionResponse {
        name,
        content: complete_doc,
    }))
}

/// Delete a flag definition file
#[utoipa::path(
    delete,
    path = "/api/flags/{name}",
    params(
        ("name" = String, Path, description = "Name of the flag definition file to delete")
    ),
    responses(
        (status = 204, description = "Flag definition file deleted successfully"),
        (status = 404, description = "Flag definition not found"),
        (status = 400, description = "Invalid filename"),
        (status = 500, description = "Internal server error")
    ),
    tag = "flags"
)]
pub async fn delete_flag(
    State(state): State<AppState>,
    Path(name): Path<String>,
) -> AppResult<impl IntoResponse> {
    let file_path = get_flag_file_path(&state.config.flags_dir, &name)?;

    // Check if file exists
    if !file_path.exists() {
        return Err(AppError::NotFound(format!(
            "Flag definition '{}' not found",
            name
        )));
    }

    // Delete the file
    fs::remove_file(&file_path)
        .map_err(|e| AppError::InternalServerError(format!("Failed to delete file: {}", e)))?;

    Ok(StatusCode::NO_CONTENT)
}
