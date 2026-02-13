use axum::{http::StatusCode, response::IntoResponse, Json};
use serde::Serialize;

#[derive(Serialize)]
struct HealthResponse {
    status: String,
    message: String,
}

/// GET /health - Basic liveness check
pub async fn health_check() -> impl IntoResponse {
    (
        StatusCode::OK,
        Json(HealthResponse {
            status: "ok".to_string(),
            message: "Server is running".to_string(),
        }),
    )
}

/// GET /ready - Readiness check
pub async fn readiness_check() -> impl IntoResponse {
    // For now, just return OK. In the future, this can check database connections,
    // external services, etc.
    (
        StatusCode::OK,
        Json(HealthResponse {
            status: "ready".to_string(),
            message: "Server is ready to accept requests".to_string(),
        }),
    )
}
