use crate::db::SharedDatabase;
use crate::models::{DisplayFlag, Environment};
use crate::service;
use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    Json, Router,
};
use axum::routing::{delete, get, post, put};
use serde::Deserialize;
use serde_json::Value;
use std::collections::HashMap;

pub type AppState = SharedDatabase;

/// Create the Axum router with all service routes mounted under `/api`
pub fn create_router(state: AppState) -> Router {
    let api = Router::new()
        // File management
        .route("/files", get(list_files))
        .route("/files/:name", post(create_file_handler))
        .route("/files/:name", delete(delete_file_handler))
        // Schema import / export
        .route("/files/:name/import", post(import_schema_handler))
        .route("/files/:name/export", get(export_schema_handler))
        // Flag management
        .route("/files/:name/flags", get(get_flags_handler))
        .route("/files/:name/flags/:flag_key", get(get_flag_handler))
        .route("/files/:name/flags/:flag_key", put(create_or_update_flag_handler))
        .route("/files/:name/flags/:flag_key", delete(delete_flag_handler))
        // Environment management
        .route("/files/:name/environments", get(get_environments_handler))
        .route("/files/:name/environments/:display_name", put(create_or_update_environment_handler))
        .route("/files/:name/environments/:display_name", delete(delete_environment_handler))
        // Metadata
        .route("/files/:name/metadata", get(get_metadata_handler))
        .route("/files/:name/metadata", put(set_metadata_handler))
        .with_state(state);

    Router::new().nest("/api", api)
}

// ─── File management ──────────────────────────────────────────────────────────

/// GET /api/files
async fn list_files(State(db): State<AppState>) -> impl IntoResponse {
    let db = db.read().unwrap();
    let files = service::list_files(&db);
    Json(files)
}

/// POST /api/files/:name
async fn create_file_handler(
    State(db): State<AppState>,
    Path(name): Path<String>,
) -> impl IntoResponse {
    let mut db = db.write().unwrap();
    match service::create_file(&mut db, &name) {
        Ok(()) => (StatusCode::CREATED, Json(serde_json::json!({ "name": name }))).into_response(),
        Err(e) => error_response(StatusCode::CONFLICT, &e.to_string()),
    }
}

/// DELETE /api/files/:name
async fn delete_file_handler(
    State(db): State<AppState>,
    Path(name): Path<String>,
) -> impl IntoResponse {
    let mut db = db.write().unwrap();
    match service::delete_file(&mut db, &name) {
        Ok(()) => StatusCode::NO_CONTENT.into_response(),
        Err(e) => error_response(StatusCode::NOT_FOUND, &e.to_string()),
    }
}

// ─── Schema import / export ───────────────────────────────────────────────────

/// POST /api/files/:name/import   body: raw flagd JSON schema
async fn import_schema_handler(
    State(db): State<AppState>,
    Path(name): Path<String>,
    body: String,
) -> impl IntoResponse {
    let mut db = db.write().unwrap();
    match service::import_schema(&mut db, &name, &body) {
        Ok(()) => (StatusCode::OK, Json(serde_json::json!({ "name": name }))).into_response(),
        Err(e) => error_response(StatusCode::BAD_REQUEST, &e.to_string()),
    }
}

/// GET /api/files/:name/export   returns flagd JSON schema
async fn export_schema_handler(
    State(db): State<AppState>,
    Path(name): Path<String>,
) -> impl IntoResponse {
    let db = db.read().unwrap();
    match service::export_schema(&db, &name) {
        Ok(json_str) => (
            StatusCode::OK,
            [(axum::http::header::CONTENT_TYPE, "application/json")],
            json_str,
        )
            .into_response(),
        Err(e) => error_response(StatusCode::NOT_FOUND, &e.to_string()),
    }
}

// ─── Flag management ──────────────────────────────────────────────────────────

/// GET /api/files/:name/flags
async fn get_flags_handler(
    State(db): State<AppState>,
    Path(name): Path<String>,
) -> impl IntoResponse {
    let db = db.read().unwrap();
    match service::get_flags(&db, &name) {
        Ok(flags) => Json(flags).into_response(),
        Err(e) => error_response(StatusCode::NOT_FOUND, &e.to_string()),
    }
}

/// GET /api/files/:name/flags/:flag_key
async fn get_flag_handler(
    State(db): State<AppState>,
    Path((name, flag_key)): Path<(String, String)>,
) -> impl IntoResponse {
    let db = db.read().unwrap();
    match service::get_flag(&db, &name, &flag_key) {
        Ok(Some(flag)) => Json(flag).into_response(),
        Ok(None) => error_response(StatusCode::NOT_FOUND, "Flag not found"),
        Err(e) => error_response(StatusCode::NOT_FOUND, &e.to_string()),
    }
}

#[derive(Deserialize)]
struct CreateOrUpdateFlagRequest {
    flag: DisplayFlag,
    previous_key: Option<String>,
}

/// PUT /api/files/:name/flags/:flag_key
async fn create_or_update_flag_handler(
    State(db): State<AppState>,
    Path((name, _flag_key)): Path<(String, String)>,
    Json(body): Json<CreateOrUpdateFlagRequest>,
) -> impl IntoResponse {
    let mut db = db.write().unwrap();
    match service::create_or_update_flag(&mut db, &name, body.flag, body.previous_key.as_deref()) {
        Ok(()) => StatusCode::NO_CONTENT.into_response(),
        Err(e) => error_response(StatusCode::NOT_FOUND, &e.to_string()),
    }
}

/// DELETE /api/files/:name/flags/:flag_key
async fn delete_flag_handler(
    State(db): State<AppState>,
    Path((name, flag_key)): Path<(String, String)>,
) -> impl IntoResponse {
    let mut db = db.write().unwrap();
    match service::delete_flag(&mut db, &name, &flag_key) {
        Ok(()) => StatusCode::NO_CONTENT.into_response(),
        Err(e) => error_response(StatusCode::NOT_FOUND, &e.to_string()),
    }
}

// ─── Environment management ───────────────────────────────────────────────────

/// GET /api/files/:name/environments
async fn get_environments_handler(
    State(db): State<AppState>,
    Path(name): Path<String>,
) -> impl IntoResponse {
    let db = db.read().unwrap();
    match service::get_environments(&db, &name) {
        Ok(envs) => Json(envs).into_response(),
        Err(e) => error_response(StatusCode::NOT_FOUND, &e.to_string()),
    }
}

/// PUT /api/files/:name/environments/:display_name
async fn create_or_update_environment_handler(
    State(db): State<AppState>,
    Path((name, _display_name)): Path<(String, String)>,
    Json(env): Json<Environment>,
) -> impl IntoResponse {
    let mut db = db.write().unwrap();
    match service::create_or_update_environment(&mut db, &name, env) {
        Ok(()) => StatusCode::NO_CONTENT.into_response(),
        Err(e) => error_response(StatusCode::NOT_FOUND, &e.to_string()),
    }
}

/// DELETE /api/files/:name/environments/:display_name
async fn delete_environment_handler(
    State(db): State<AppState>,
    Path((name, display_name)): Path<(String, String)>,
) -> impl IntoResponse {
    let mut db = db.write().unwrap();
    match service::delete_environment(&mut db, &name, &display_name) {
        Ok(()) => StatusCode::NO_CONTENT.into_response(),
        Err(e) => error_response(StatusCode::NOT_FOUND, &e.to_string()),
    }
}

// ─── Metadata ─────────────────────────────────────────────────────────────────

/// GET /api/files/:name/metadata
async fn get_metadata_handler(
    State(db): State<AppState>,
    Path(name): Path<String>,
) -> impl IntoResponse {
    let db = db.read().unwrap();
    match service::get_metadata(&db, &name) {
        Ok(Some(meta)) => Json(meta).into_response(),
        Ok(None) => Json(serde_json::json!({})).into_response(),
        Err(e) => error_response(StatusCode::NOT_FOUND, &e.to_string()),
    }
}

/// PUT /api/files/:name/metadata
async fn set_metadata_handler(
    State(db): State<AppState>,
    Path(name): Path<String>,
    Json(meta): Json<HashMap<String, Value>>,
) -> impl IntoResponse {
    let mut db = db.write().unwrap();
    match service::set_metadata(&mut db, &name, meta) {
        Ok(()) => StatusCode::NO_CONTENT.into_response(),
        Err(e) => error_response(StatusCode::NOT_FOUND, &e.to_string()),
    }
}

// ─── Helper ───────────────────────────────────────────────────────────────────

fn error_response(status: StatusCode, message: &str) -> axum::response::Response {
    (status, Json(serde_json::json!({ "error": message }))).into_response()
}
