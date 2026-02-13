use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde::Serialize;

/// Custom error types for the application
#[derive(Debug)]
pub enum AppError {
    NotFound(String),
    BadRequest(String),
    InternalServerError(String),
}

/// JSON error response structure
#[derive(Serialize)]
struct ErrorResponse {
    error: String,
    status: u16,
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, message) = match self {
            AppError::NotFound(msg) => {
                tracing::warn!(error = %msg, "Request failed with not found error");
                (StatusCode::NOT_FOUND, "Not found".to_string())
            }
            AppError::BadRequest(msg) => {
                tracing::warn!(error = %msg, "Request failed with bad request error");
                (StatusCode::BAD_REQUEST, "Bad request".to_string())
            }
            AppError::InternalServerError(msg) => {
                tracing::error!(error = %msg, "Request failed with internal server error");
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "Internal server error".to_string(),
                )
            }
        };

        let body = Json(ErrorResponse {
            error: message,
            status: status.as_u16(),
        });

        (status, body).into_response()
    }
}

/// Result type alias for convenience
pub type AppResult<T> = Result<T, AppError>;
